import type { PermissionKey } from "@pathway/platform";

export type FinanceAccessMode = "ACTIVE" | "SERVICING_ONLY" | "LOCKED";

export type FinanceStaffAction =
  | "READ_RECORDS"
  | "DOWNLOAD_DOCUMENT"
  | "EXPORT_REPORT"
  | "CREATE_INVOICE"
  | "ISSUE_INVOICE"
  | "CREATE_CREDIT"
  | "RECORD_IN_FLIGHT_PAYMENT"
  | "RECORD_RECEIPT"
  | "ALLOCATE_RECEIPT"
  | "RECONCILE"
  | "REFUND"
  | "HANDLE_DISPUTE"
  | "REVERSE_RECEIPT"
  | "GRANT_PAYER_ACCESS"
  | "REVOKE_PAYER_ACCESS"
  | "CREATE_MANDATE"
  | "SCHEDULE_DEBIT"
  | "SUBMIT_ROUTINE_DEBIT"
  | "APPROVE_AUTOMATED_DEBIT";

export type FinancePayerAction =
  | "READ_ACCOUNT"
  | "DOWNLOAD_DOCUMENT"
  | "SETTLE_ISSUED_INVOICE";

export type FinancePermissionKey = Extract<PermissionKey, `finance.${string}`>;
export type FinancePayerPermissionKey =
  | "finance.family_invoices.read"
  | "finance.family_payments.pay"
  | "finance.family_statements.read";

export type FinanceAccessRequirement =
  | {
      kind: "staff";
      permission: FinancePermissionKey;
      action: FinanceStaffAction;
    }
  | {
      kind: "payer";
      permission: FinancePayerPermissionKey;
      action: FinancePayerAction;
      accountParam: string;
    };

export const FINANCE_ACCESS_REQUIREMENT = "pathway:finance_access_requirement";
