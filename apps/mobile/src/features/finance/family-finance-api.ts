import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { env } from "@/config/env";
import { apiClient, ApiError } from "@/lib/api/client";

export {
  formatFinanceAmount,
  minorToMajorInput,
  parseMajorAmountToMinor,
} from "./family-finance-money";

export interface FamilyPayerAccount {
  id: string;
  displayName: string;
}

export interface FamilyInvoice {
  id: string;
  payerAccountId: string;
  invoiceNumber: string | null;
  status: "ISSUED" | "VOID";
  currency: string;
  cardPayment?: { eligible: boolean; reason: string | null };
  subtotalMinor: string;
  taxMinor: string;
  totalMinor: string;
  balance: {
    issuedGrossMinor: string;
    issuedCreditsMinor: string;
    allocatedReceiptsMinor: string;
    outstandingMinor: string;
    creditBalanceMinor: string;
  };
  issuedAt: string | null;
  dueDate: string | null;
  createdAt: string;
  lines: Array<{
    id: string;
    lineOrder: number;
    description: string;
    quantity: string;
    totalMinor: string;
  }>;
  checkout: { attemptId: string; status: "PROCESSING" } | null;
}

export interface FamilyStatement {
  id: string;
  kind: "ON_DEMAND" | "MONTH_END";
  status: "GENERATING" | "READY" | "FAILED";
  payerAccountId: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  ledgerCutoffAt: string;
  readyAt: string | null;
  currency: string;
  totals: {
    openingBalanceMinor: string;
    chargesIssuedMinor: string;
    creditsIssuedMinor: string;
    allocatedReceiptsMinor: string;
    reversalsMinor: string;
    closingBalanceMinor: string;
    unappliedFundsMinor: string;
    uncoveredOutflowsMinor: string;
    processingFundsMinor: string;
  };
  lineCount: number;
}

export interface FamilyBankTransferDetails {
  currency: string;
  outstandingMinor: string;
  accountHolderName: string;
  sortCode: string;
  accountNumber: string;
  reference: string;
}

export interface PayerCheckoutStatus {
  attemptId: string;
  invoiceId: string;
  payerAccountId: string;
  status: "CHECKING" | "CONFIRMED" | "EXPIRED" | "FAILED";
  checkedAt: string;
}

export interface FamilyInvoicePage {
  nextCursor: string | null;
  items: FamilyInvoice[];
}

export interface FamilyStatementPage {
  nextCursor: string | null;
  items: FamilyStatement[];
}

export async function listFamilyPayerAccounts(): Promise<FamilyPayerAccount[]> {
  const result = await apiClient.request<{ items: FamilyPayerAccount[] }>(
    "/finance/family/payer-accounts",
  );
  return result.items;
}

export function listFamilyInvoices(
  payerAccountId: string,
  cursor?: string,
): Promise<FamilyInvoicePage> {
  return apiClient.request(
    `/finance/payer-accounts/${encodeURIComponent(payerAccountId)}/invoices?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
  );
}

export function listFamilyStatements(
  payerAccountId: string,
  cursor?: string,
): Promise<FamilyStatementPage> {
  return apiClient.request(
    `/finance/payer-accounts/${encodeURIComponent(payerAccountId)}/statements?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
  );
}

export function createFamilyStatement(
  payerAccountId: string,
  periodStart: string,
  periodEnd: string,
): Promise<FamilyStatement> {
  return apiClient.request(
    `/finance/payer-accounts/${encodeURIComponent(payerAccountId)}/statements`,
    {
      method: "POST",
      headers: { "Idempotency-Key": requestKey("statement") },
      body: JSON.stringify({
        periodStart: `${periodStart}T00:00:00.000Z`,
        periodEnd: `${periodEnd}T23:59:59.999Z`,
      }),
    },
  );
}

export function startFamilyInvoiceCheckout(
  payerAccountId: string,
  invoiceId: string,
): Promise<{
  attemptId: string;
  status: "OPEN" | "CHECKING";
  checkoutUrl: string | null;
  expiresAt: string | null;
}> {
  return apiClient.request(
    `/finance/payer-accounts/${encodeURIComponent(payerAccountId)}/invoices/${encodeURIComponent(invoiceId)}/checkout`,
    { method: "POST" },
  );
}

export function getPayerCheckoutStatus(
  attemptId: string,
): Promise<PayerCheckoutStatus> {
  return apiClient.request(
    `/finance/payer-checkout-attempts/${encodeURIComponent(attemptId)}`,
  );
}

export function getFamilyBankTransferDetails(
  payerAccountId: string,
  invoiceId: string,
): Promise<FamilyBankTransferDetails> {
  return apiClient.request(
    `/finance/payer-accounts/${encodeURIComponent(payerAccountId)}/invoices/${encodeURIComponent(invoiceId)}/bank-transfer`,
  );
}

export function submitFamilyTransferNotice(
  payerAccountId: string,
  invoiceId: string,
  amountMinor: string,
): Promise<{ id: string }> {
  return apiClient.request(
    `/finance/payer-accounts/${encodeURIComponent(payerAccountId)}/invoices/${encodeURIComponent(invoiceId)}/transfer-notices`,
    {
      method: "POST",
      headers: { "Idempotency-Key": requestKey("transfer") },
      body: JSON.stringify({
        amountMinor,
        declaredTransferredAt: new Date().toISOString(),
      }),
    },
  );
}

export async function downloadFamilyDocument(
  path: string,
  fileName: string,
): Promise<void> {
  const token = apiClient.getAccessToken();
  if (!token) throw new Error("Your session has expired. Sign in again.");
  const directory = FileSystem.cacheDirectory;
  if (!directory) throw new Error("Secure document storage is unavailable.");

  const destination = `${directory}${fileName}`;
  let downloadedUri = destination;
  try {
    const download = await FileSystem.downloadAsync(
      `${env.apiUrl}${path}`,
      destination,
      {
        headers: {
          Accept: "application/pdf",
          Authorization: `Bearer ${token}`,
          "Cache-Control": "no-store",
        },
      },
    );
    downloadedUri = download.uri;
    if (download.status < 200 || download.status >= 300) {
      if (download.status === 401 || download.status === 403) {
        throw new ApiError("Finance access unavailable", download.status, "");
      }
      throw new Error("The document could not be downloaded. Try again.");
    }
    if (!(await Sharing.isAvailableAsync())) {
      throw new Error("Document sharing is unavailable on this device.");
    }
    await Sharing.shareAsync(download.uri, {
      mimeType: "application/pdf",
      UTI: "com.adobe.pdf",
      dialogTitle: "Open Finance document",
    });
  } finally {
    await FileSystem.deleteAsync(downloadedUri, { idempotent: true }).catch(
      () => undefined,
    );
  }
}

function requestKey(prefix: string): string {
  return `family-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
