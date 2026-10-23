import { z } from "zod";
import { API_BASE_URL, apiFetch } from "./api-client";
import { apiErrorFromResponse } from "./api-transport";
import { financeJsonResponse } from "./finance-api-client-support";

export type FinanceReportType =
  | "receivables-ageing"
  | "receipts-allocation"
  | "exceptions"
  | "payout-reconciliation";

export type FinanceReportFilters = {
  from: string;
  to: string;
  asOf: string;
};

const metadataSchema = z.object({
  from: z.string(),
  to: z.string(),
  asOfDate: z.string(),
  timeZone: z.literal("Europe/London"),
  generatedAt: z.string(),
  ledgerCutoffAt: z.string(),
  currency: z.string().nullable(),
  legalEntityName: z.string().nullable(),
  reportingBasis: z.string(),
});

const totalsSchema = z.object({
  issuedGrossMinor: z.string(),
  creditsMinor: z.string(),
  confirmedReceiptsMinor: z.string(),
  refundsMinor: z.string(),
  returnsMinor: z.string(),
  refundsAndReturnsMinor: z.string(),
  allocatedReceiptsMinor: z.string(),
  outstandingMinor: z.string(),
  overdueMinor: z.string(),
  unappliedMinor: z.string(),
  processingMinor: z.string(),
  reviewRequiredMinor: z.string(),
});

const reportRowSchema = z.object({
  recordType: z.string(),
  reference: z.string(),
  date: z.string().nullable(),
  payerName: z.string().nullable(),
  status: z.string(),
  amountMinor: z.string().nullable(),
  currency: z.string().nullable(),
  description: z.string(),
  dueDate: z.string().nullable(),
  outstandingMinor: z.string().nullable(),
  ageingBucket: z.string().nullable(),
  overdueDays: z.number().nullable(),
  feeMinor: z.string().nullable(),
  payoutStatus: z.string().nullable(),
});

const providerSchema = z.object({
  status: z.enum(["CONNECTED", "NOT_CONNECTED", "UNAVAILABLE"]),
  fetchedAt: z.string().nullable(),
  source: z.literal("PERSISTED_RECONCILIATION"),
  context: z
    .object({ id: z.string(), accountId: z.string(), livemode: z.boolean() })
    .nullable(),
  freshness: z.enum(["CURRENT", "STALE", "INCOMPLETE", "NOT_SYNCED"]),
  periodStartCoverage: z.literal("UNPROVEN"),
  truncated: z.boolean(),
  coverage: z.array(
    z.object({
      stream: z.string(),
      completedThrough: z.string().nullable(),
      lastSucceededAt: z.string().nullable(),
      lastError: z.string().nullable(),
    }),
  ),
  feesByCurrency: z.array(
    z.object({ currency: z.string(), amountMinor: z.string() }),
  ),
  payouts: z.array(
    z.object({
      id: z.string(),
      amountMinor: z.string(),
      currency: z.string(),
      createdAt: z.string(),
      arrivalAt: z.string().nullable(),
      status: z.string(),
      balanceTransactionId: z.string().nullable(),
    }),
  ),
});

export type FinanceReportTotals = z.infer<typeof totalsSchema>;
export type FinanceReportRow = z.infer<typeof reportRowSchema>;
export type FinanceReportSummary = {
  metadata: z.infer<typeof metadataSchema>;
  totals: FinanceReportTotals | null;
  provider: z.infer<typeof providerSchema>;
  accessMode?: "ACTIVE" | "SERVICING_ONLY";
};

export type FinanceReport = {
  type: FinanceReportType;
  metadata: z.infer<typeof metadataSchema>;
  totals: FinanceReportTotals | null;
  rows: FinanceReportRow[];
  provider?: Omit<z.infer<typeof providerSchema>, "payouts">;
};

export async function fetchFinanceReportSummary(
  filters: FinanceReportFilters,
): Promise<FinanceReportSummary> {
  const response = await apiFetch(
    `${API_BASE_URL}/finance/reports/summary?${query(filters)}`,
    { cache: "no-store" },
  );
  const payload = await financeJsonResponse(
    response,
    "Finance report could not be loaded.",
  );
  return z
    .object({
      metadata: metadataSchema,
      totals: totalsSchema.nullable(),
      provider: providerSchema,
      accessMode: z.enum(["ACTIVE", "SERVICING_ONLY"]).optional(),
    })
    .parse(payload);
}

export async function fetchFinanceReport(
  type: FinanceReportType,
  filters: FinanceReportFilters,
): Promise<FinanceReport> {
  const response = await apiFetch(
    `${API_BASE_URL}/finance/reports/${type}?${query(filters)}`,
    { cache: "no-store" },
  );
  const payload = await financeJsonResponse(
    response,
    "Finance report could not be loaded.",
  );
  return z
    .object({
      type: z.enum([
        "receivables-ageing",
        "receipts-allocation",
        "exceptions",
        "payout-reconciliation",
      ]),
      metadata: metadataSchema,
      totals: totalsSchema.nullable(),
      rows: z.array(reportRowSchema),
      provider: providerSchema.omit({ payouts: true }).optional(),
    })
    .parse(payload);
}

export async function downloadFinanceReport(
  type: FinanceReportType,
  filters: FinanceReportFilters,
): Promise<{ filename: string; blob: Blob }> {
  const response = await apiFetch(
    `${API_BASE_URL}/finance/reports/${type}/export?${query(filters)}`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    throw await apiErrorFromResponse(
      response,
      "Finance export could not be created.",
    );
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  const filename =
    /filename="([^"]+)"/i.exec(disposition)?.[1] ?? `finance-${type}.csv`;
  return { filename, blob: await response.blob() };
}

function query(filters: FinanceReportFilters): string {
  return new URLSearchParams(filters).toString();
}
