export interface FinanceSettlementReportConnection {
  id: string;
  accountId: string;
  livemode: boolean;
}
export interface FinanceSettlementReportStream {
  stream: string;
  completedThrough: Date | null;
  lastSucceededAt: Date | null;
  windowFrom: Date | null;
  windowTo: Date | null;
  lastError: string | null;
}
export interface FinanceSettlementReportInput {
  connection: FinanceSettlementReportConnection;
  generatedAt: Date;
  periodEnd: Date;
  balanceEvidence: { facts: unknown; observedAt: Date }[];
  payoutEvidence: {
    payoutFacts: unknown;
    coverage: unknown;
    updatedAt: Date;
  }[];
  streams: FinanceSettlementReportStream[];
  truncated: boolean;
}
export interface FinanceSettlementReport {
  status: "CONNECTED" | "NOT_CONNECTED" | "UNAVAILABLE";
  source: "PERSISTED_RECONCILIATION";
  context: FinanceSettlementReportConnection | null;
  fetchedAt: string | null;
  freshness: "CURRENT" | "STALE" | "INCOMPLETE" | "NOT_SYNCED";
  periodStartCoverage: "UNPROVEN";
  truncated: boolean;
  coverage: {
    stream: string;
    completedThrough: string | null;
    lastSucceededAt: string | null;
    lastError: string | null;
  }[];
  feesByCurrency: { currency: string; amountMinor: string }[];
  payouts: {
    id: string;
    amountMinor: string;
    currency: string;
    createdAt: string;
    arrivalAt: string | null;
    status: string;
    balanceTransactionId: string | null;
    reconciliationStatus: string;
    complete: boolean;
    netMinor: string;
  }[];
}
