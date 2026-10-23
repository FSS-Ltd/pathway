import type {
  FinanceReconciliationScope,
  FinanceReconciliationStream,
} from "../stripe/finance-stripe-reconciliation.provider";
import type { FinanceReconciliationWindow } from "./finance-reconciliation-window";

export interface FinanceConnectionScope extends FinanceReconciliationScope {
  connectionId: string;
  tenantId: string;
  orgId: string;
}

export type FinanceRecoveryStream =
  | FinanceReconciliationStream
  | "unresolvedOperations"
  | "payoutContinuations"
  | "caseRequests";

export interface FinanceReconciliationLease {
  scope: FinanceConnectionScope;
  stream: FinanceRecoveryStream;
  stateId: string;
  token: string;
  window: FinanceReconciliationWindow;
}

export type FinanceReconciliationPageCommit =
  | { kind: "lost" }
  | { kind: "completed" }
  | { kind: "continued"; lease: FinanceReconciliationLease };
