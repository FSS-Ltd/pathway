import { z } from "zod";
import type { FinanceRecoveryStream } from "./finance-reconciliation.types";

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
] as const satisfies readonly FinanceRecoveryStream[];
export const financeRecoveryRequestSchema = z
  .object({
    tenantId: z.string().min(1).max(128),
    orgId: z.string().min(1).max(128),
    connectionId: z.string().uuid(),
    stream: z.enum(financeRecoveryStreams),
    mode: z.enum(["sync", "dry-run"]).default("dry-run"),
  })
  .strict();
export type FinanceRecoveryRequest = z.infer<
  typeof financeRecoveryRequestSchema
>;
export type FinanceRecoveryWork = Omit<FinanceRecoveryRequest, "mode">;
