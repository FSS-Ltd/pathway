import { z } from "zod";
import { API_BASE_URL, apiFetch } from "./api-client";
import { apiErrorFromResponse } from "./api-transport";
import { financeJsonResponse } from "./finance-api-client-support";

export type FinanceInvoice = {
  id: string;
  payerAccountId: string;
  invoiceNumber: string | null;
  status: "DRAFT" | "IN_REVIEW" | "ISSUED" | "VOID";
  payerName: string | null;
  currency: string;
  totalMinor: string;
  balance: {
    outstandingMinor: string;
    issuedCreditsMinor: string;
    allocatedReceiptsMinor: string;
  };
  dueDate: string | null;
  issuedAt: string | null;
  approvedAt: string | null;
  createdAt: string;
};

export type FinanceReceipt = {
  id: string;
  payerAccountId: string | null;
  payerName: string | null;
  amountMinor: string;
  currency: string;
  source: string;
  sourceReference: string | null;
  status: "PROCESSING" | "CONFIRMED" | "FAILED";
  confirmedAt: string | null;
  createdAt: string;
  processingMinor: string;
  failedMinor: string;
  unappliedMinor: string;
  allocations: Array<{
    id: string;
    invoiceId: string;
    invoiceNumber: string | null;
    amountMinor: string;
    reversedMinor: string;
    netAmountMinor: string;
    createdAt: string;
    reversals: Array<{
      id: string;
      amountMinor: string;
      reason: string;
      actorUserId: string;
      createdAt: string;
    }>;
  }>;
};

export type FinanceStatement = {
  id: string;
  payerAccountId: string;
  kind: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  currency: string;
  totals: { closingBalanceMinor: string };
  lineCount: number;
};

export type FinancePayerAccount = { id: string; displayName: string };
export type FinancePage<T> = {
  items: T[];
  nextCursor: string | null;
};

export async function fetchFinanceInvoices(
  cursor?: string | null,
): Promise<FinancePage<FinanceInvoice>> {
  const params = new URLSearchParams({ limit: "100" });
  if (cursor) params.set("cursor", cursor);
  const payload = await getJson(
    `${API_BASE_URL}/finance/invoices?${params}`,
    "Invoices could not be loaded.",
  );
  return z
    .object({
      nextCursor: z.string().uuid().nullable(),
      items: z.array(
        z.object({
          id: z.string(),
          payerAccountId: z.string(),
          invoiceNumber: z.string().nullable(),
          status: z.enum(["DRAFT", "IN_REVIEW", "ISSUED", "VOID"]),
          payerName: z.string().nullable(),
          currency: z.string(),
          totalMinor: z.string(),
          balance: z.object({
            outstandingMinor: z.string(),
            issuedCreditsMinor: z.string(),
            allocatedReceiptsMinor: z.string(),
          }),
          dueDate: z.string().nullable(),
          issuedAt: z.string().nullable(),
          approvedAt: z.string().nullable(),
          createdAt: z.string(),
        }),
      ),
    })
    .parse(payload);
}

export async function fetchFinanceReceipts(
  cursor?: string | null,
): Promise<FinancePage<FinanceReceipt>> {
  const params = new URLSearchParams({ limit: "100" });
  if (cursor) params.set("cursor", cursor);
  const payload = await getJson(
    `${API_BASE_URL}/finance/receipts?${params}`,
    "Payments could not be loaded.",
  );
  return z
    .object({
      nextCursor: z.string().uuid().nullable(),
      items: z.array(
        z.object({
          id: z.string(),
          payerAccountId: z.string().nullable(),
          payerName: z.string().nullable(),
          amountMinor: z.string(),
          currency: z.string(),
          source: z.string(),
          sourceReference: z.string().nullable(),
          status: z.enum(["PROCESSING", "CONFIRMED", "FAILED"]),
          confirmedAt: z.string().nullable(),
          createdAt: z.string(),
          processingMinor: z.string(),
          failedMinor: z.string(),
          unappliedMinor: z.string(),
          allocations: z.array(
            z.object({
              id: z.string(),
              invoiceId: z.string(),
              invoiceNumber: z.string().nullable(),
              amountMinor: z.string(),
              reversedMinor: z.string(),
              netAmountMinor: z.string(),
              createdAt: z.string(),
              reversals: z.array(
                z.object({
                  id: z.string(),
                  amountMinor: z.string(),
                  reason: z.string(),
                  actorUserId: z.string(),
                  createdAt: z.string(),
                }),
              ),
            }),
          ),
        }),
      ),
    })
    .parse(payload);
}

export async function fetchFinanceReceipt(
  receiptId: string,
): Promise<FinanceReceipt> {
  const payload = await getJson(
    `${API_BASE_URL}/finance/receipts/${encodeURIComponent(receiptId)}`,
    "Payment detail could not be loaded.",
  );
  return z
    .object({
      id: z.string(),
      payerAccountId: z.string().nullable(),
      payerName: z.string().nullable(),
      amountMinor: z.string(),
      currency: z.string(),
      source: z.string(),
      sourceReference: z.string().nullable(),
      status: z.enum(["PROCESSING", "CONFIRMED", "FAILED"]),
      confirmedAt: z.string().nullable(),
      createdAt: z.string(),
      processingMinor: z.string(),
      failedMinor: z.string(),
      unappliedMinor: z.string(),
      allocations: z.array(
        z.object({
          id: z.string(),
          invoiceId: z.string(),
          invoiceNumber: z.string().nullable(),
          amountMinor: z.string(),
          reversedMinor: z.string(),
          netAmountMinor: z.string(),
          createdAt: z.string(),
          reversals: z.array(
            z.object({
              id: z.string(),
              amountMinor: z.string(),
              reason: z.string(),
              actorUserId: z.string(),
              createdAt: z.string(),
            }),
          ),
        }),
      ),
    })
    .parse(payload);
}

export async function fetchFinanceStatements(
  cursor?: string | null,
): Promise<FinancePage<FinanceStatement>> {
  const params = new URLSearchParams({ limit: "100" });
  if (cursor) params.set("cursor", cursor);
  const payload = await getJson(
    `${API_BASE_URL}/finance/statements?${params}`,
    "Statements could not be loaded.",
  );
  return z
    .object({
      nextCursor: z.string().uuid().nullable(),
      items: z.array(
        z.object({
          id: z.string(),
          payerAccountId: z.string(),
          kind: z.string(),
          status: z.string(),
          periodStart: z.string(),
          periodEnd: z.string(),
          generatedAt: z.string(),
          currency: z.string(),
          totals: z.object({ closingBalanceMinor: z.string() }),
          lineCount: z.number(),
        }),
      ),
    })
    .parse(payload);
}

export async function downloadFinanceStatement(
  statementId: string,
): Promise<Blob> {
  const response = await apiFetch(
    `${API_BASE_URL}/finance/statements/${encodeURIComponent(statementId)}/download`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    throw await apiErrorFromResponse(
      response,
      "Statement could not be downloaded.",
    );
  }
  return response.blob();
}

export async function requestFinanceStatement(input: {
  payerAccountId: string;
  periodStart: string;
  periodEnd: string;
}): Promise<unknown> {
  const response = await apiFetch(`${API_BASE_URL}/finance/statements`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": `statement-${crypto.randomUUID()}`,
    },
    body: JSON.stringify(input),
  });
  return financeJsonResponse(response, "Statement could not be generated.");
}

export async function fetchFinancePayerAccounts(
  cursor?: string | null,
): Promise<FinancePage<FinancePayerAccount>> {
  const params = new URLSearchParams({ limit: "100" });
  if (cursor) params.set("cursor", cursor);
  const payload = await getJson(
    `${API_BASE_URL}/finance/payer-accounts?${params}`,
    "Payer accounts could not be loaded.",
  );
  return z
    .object({
      nextCursor: z.string().uuid().nullable(),
      items: z.array(z.object({ id: z.string(), displayName: z.string() })),
    })
    .parse(payload);
}

export async function createFinancePayerAccount(
  displayName: string,
  idempotencyKey: string,
) {
  const response = await apiFetch(`${API_BASE_URL}/finance/payer-accounts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": `payer-account-${idempotencyKey}`,
    },
    body: JSON.stringify({ displayName }),
  });
  return z
    .object({ id: z.string(), displayName: z.string(), createdAt: z.string() })
    .parse(
      await financeJsonResponse(
        response,
        "Payer account could not be created.",
      ),
    );
}

export async function createFinanceInvoiceDraft(
  input: {
    payerAccountId: string;
    dueDate: string | null;
    lines: Array<{
      description: string;
      quantity: string;
      unitAmountMinor: string;
      taxRateBasisPoints: number;
    }>;
  },
  idempotencyKey: string,
) {
  return financeInvoiceCommand(
    "/finance/invoices",
    "POST",
    input,
    "Invoice draft could not be saved.",
    idempotencyKey,
  );
}

export async function transitionFinanceInvoice(
  invoiceId: string,
  action: "submit-review" | "approve" | "issue",
  idempotencyKey: string,
) {
  return financeInvoiceCommand(
    `/finance/invoices/${encodeURIComponent(invoiceId)}/${action}`,
    "POST",
    undefined,
    "Invoice action could not be completed.",
    idempotencyKey,
  );
}

export async function allocateFinanceReceipt(
  receiptId: string,
  input: { invoiceId: string; amountMinor: string },
  idempotencyKey: string,
): Promise<unknown> {
  const response = await apiFetch(
    `${API_BASE_URL}/finance/receipts/${encodeURIComponent(receiptId)}/allocations`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `finance-allocation-${idempotencyKey}`,
      },
      body: JSON.stringify(input),
    },
  );
  return financeJsonResponse(response, "Receipt could not be allocated.");
}

export async function reverseFinanceReceiptAllocation(
  allocationId: string,
  input: { amountMinor: string; reason: string },
  idempotencyKey: string,
): Promise<unknown> {
  const response = await apiFetch(
    `${API_BASE_URL}/finance/allocations/${encodeURIComponent(allocationId)}/reversals`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `finance-allocation-reversal-${idempotencyKey}`,
      },
      body: JSON.stringify(input),
    },
  );
  return financeJsonResponse(
    response,
    "Allocation correction could not be recorded.",
  );
}

async function financeInvoiceCommand(
  path: string,
  method: "POST",
  input: unknown,
  fallback: string,
  idempotencyKey = crypto.randomUUID(),
) {
  const response = await apiFetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      ...(input ? { "Content-Type": "application/json" } : {}),
      "Idempotency-Key": `finance-${idempotencyKey}`,
    },
    ...(input ? { body: JSON.stringify(input) } : {}),
  });
  return financeJsonResponse(response, fallback);
}

async function getJson(url: string, fallback: string): Promise<unknown> {
  const response = await apiFetch(url, { cache: "no-store" });
  return financeJsonResponse(response, fallback);
}
