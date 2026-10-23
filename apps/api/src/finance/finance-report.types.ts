import type { FinanceAgeingBucket } from "./finance-report-projection";

export type FinanceReportMetadata = {
  from: string;
  to: string;
  asOfDate: string;
  timeZone: "Europe/London";
  generatedAt: string;
  ledgerCutoffAt: string;
  currency: string | null;
  legalEntityName: string | null;
  reportingBasis: string;
};

export type FinanceReportTotals = {
  issuedGrossMinor: string;
  creditsMinor: string;
  confirmedReceiptsMinor: string;
  refundsMinor: string;
  returnsMinor: string;
  refundsAndReturnsMinor: string;
  allocatedReceiptsMinor: string;
  outstandingMinor: string;
  overdueMinor: string;
  unappliedMinor: string;
  processingMinor: string;
  reviewRequiredMinor: string;
};

export type FinanceReportRow = {
  recordType: string;
  reference: string;
  date: string | null;
  payerName: string | null;
  status: string;
  amountMinor: string | null;
  currency: string | null;
  description: string;
  dueDate: string | null;
  outstandingMinor: string | null;
  ageingBucket: FinanceAgeingBucket | null;
  overdueDays: number | null;
  feeMinor: string | null;
  payoutStatus: string | null;
};

export type FinanceReportInvoice = {
  id: string;
  invoiceNumber: bigint | null;
  status: string;
  currency: string;
  totalMinor: bigint;
  issuedAt: Date | null;
  dueAt: Date | null;
  voidedAt: Date | null;
  createdAt: Date;
  payerNameSnapshot: string | null;
  balance: {
    outstandingMinor: string;
    issuedCreditsMinor: string;
    allocatedReceiptsMinor: string;
  };
};

export type FinanceReportSnapshot = {
  metadata: FinanceReportMetadata;
  totals: FinanceReportTotals | null;
  rows: FinanceReportRow[];
  connection: {
    id: string;
    accountId: string;
    livemode: boolean;
    collectionStatus: string;
  } | null;
};
