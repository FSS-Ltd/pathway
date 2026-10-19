import type { FinanceModuleAccess } from "./finance-access.reader";
import type {
  FinanceAccessMode,
  FinancePayerAction,
  FinanceStaffAction,
} from "./finance-access.types";

const servicingStaffActions: ReadonlySet<FinanceStaffAction> = new Set([
  "READ_RECORDS",
  "DOWNLOAD_DOCUMENT",
  "EXPORT_REPORT",
  "RECORD_IN_FLIGHT_PAYMENT",
  "RECONCILE",
  "REFUND",
  "HANDLE_DISPUTE",
  "REVERSE_RECEIPT",
  "REVOKE_PAYER_ACCESS",
  "APPROVE_AUTOMATED_DEBIT",
]);

export function resolveFinanceAccessMode(
  module: FinanceModuleAccess | null,
  now = new Date(),
): FinanceAccessMode {
  if (!module) return "LOCKED";
  if (
    module.status === "ACTIVE" &&
    (!module.expiresAt || module.expiresAt > now)
  ) {
    return "ACTIVE";
  }
  return "SERVICING_ONLY";
}

export function canPerformFinanceStaffAction(
  mode: FinanceAccessMode,
  action: FinanceStaffAction,
): boolean {
  if (mode === "ACTIVE") return true;
  return mode === "SERVICING_ONLY" && servicingStaffActions.has(action);
}

export function canPerformFinancePayerAction(
  mode: FinanceAccessMode,
  action: FinancePayerAction,
): boolean {
  if (mode === "ACTIVE") return true;
  return (
    mode === "SERVICING_ONLY" &&
    (action === "READ_ACCOUNT" ||
      action === "READ_STATEMENTS" ||
      action === "DOWNLOAD_DOCUMENT" ||
      action === "DECLARE_TRANSFER" ||
      action === "SETTLE_ISSUED_INVOICE")
  );
}

export function isIndependentFinanceApproval(
  requesterUserId: string,
  approverUserId: string,
): boolean {
  return (
    requesterUserId.length > 0 &&
    approverUserId.length > 0 &&
    requesterUserId !== approverUserId
  );
}
