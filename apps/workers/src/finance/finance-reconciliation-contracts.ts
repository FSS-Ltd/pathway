export const financeRecoveryStreams = [
  "events",
  "checkoutSessions",
  "setupIntents",
  "paymentIntents",
  "charges",
  "refunds",
  "disputes",
  "balanceTransactions",
  "payouts",
  "unresolvedOperations",
  "payoutContinuations",
  "caseRequests",
] as const;
export interface FinanceRecoveryWork {
  tenantId: string;
  orgId: string;
  connectionId: string;
  stream: (typeof financeRecoveryStreams)[number];
}
export interface FinanceRecoveryResult {
  mode: "sync" | "dry-run";
  status: "completed" | "continued" | "busy" | "failed" | "lost" | "disabled";
  pages: number;
  objects: number;
  recoverable: number;
  exceptions: number;
}
export function parseFinanceRecoveryWork(value: unknown): FinanceRecoveryWork {
  if (
    !value ||
    typeof value !== "object" ||
    !("tenantId" in value) ||
    typeof value.tenantId !== "string" ||
    !value.tenantId ||
    value.tenantId.length > 128 ||
    !("orgId" in value) ||
    typeof value.orgId !== "string" ||
    !value.orgId ||
    value.orgId.length > 128 ||
    !("connectionId" in value) ||
    typeof value.connectionId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.connectionId,
    ) ||
    !("stream" in value)
  )
    throw new Error("Finance recovery work is invalid");
  const stream = financeRecoveryStreams.find(
    (candidate) => candidate === value.stream,
  );
  if (!stream) throw new Error("Finance recovery stream is invalid");
  return {
    tenantId: value.tenantId,
    orgId: value.orgId,
    connectionId: value.connectionId,
    stream,
  };
}
