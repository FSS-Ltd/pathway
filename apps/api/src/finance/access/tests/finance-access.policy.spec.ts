import { ModuleStatus } from "@pathway/db";
import {
  canPerformFinancePayerAction,
  canPerformFinanceStaffAction,
  isIndependentFinanceApproval,
  resolveFinanceAccessMode,
} from "../finance-access.policy";

describe("Finance access policy", () => {
  const now = new Date("2026-10-15T12:00:00.000Z");

  it("locks an organisation with no Finance module history", () => {
    expect(resolveFinanceAccessMode(null, now)).toBe("LOCKED");
  });

  it("grants active mode only while the Finance module is current", () => {
    expect(
      resolveFinanceAccessMode(
        { status: ModuleStatus.ACTIVE, expiresAt: null },
        now,
      ),
    ).toBe("ACTIVE");
    expect(
      resolveFinanceAccessMode(
        {
          status: ModuleStatus.ACTIVE,
          expiresAt: new Date("2026-10-15T12:00:00.001Z"),
        },
        now,
      ),
    ).toBe("ACTIVE");
  });

  it("keeps prior or expired Finance access in servicing mode", () => {
    expect(
      resolveFinanceAccessMode(
        { status: ModuleStatus.CANCELLED, expiresAt: now },
        now,
      ),
    ).toBe("SERVICING_ONLY");
    expect(
      resolveFinanceAccessMode(
        {
          status: ModuleStatus.ACTIVE,
          expiresAt: new Date("2026-10-15T11:59:59.999Z"),
        },
        now,
      ),
    ).toBe("SERVICING_ONLY");
  });

  it("allows only servicing actions after entitlement ends", () => {
    for (const action of [
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
    ] as const) {
      expect(canPerformFinanceStaffAction("SERVICING_ONLY", action)).toBe(true);
    }
    for (const action of [
      "CREATE_INVOICE",
      "ISSUE_INVOICE",
      "CREATE_CREDIT",
      "RECORD_RECEIPT",
      "ALLOCATE_RECEIPT",
      "GRANT_PAYER_ACCESS",
      "CREATE_MANDATE",
      "SCHEDULE_DEBIT",
      "SUBMIT_ROUTINE_DEBIT",
    ] as const) {
      expect(canPerformFinanceStaffAction("SERVICING_ONLY", action)).toBe(
        false,
      );
    }
  });

  it("allows a payer only to read or settle an issued invoice during servicing", () => {
    expect(canPerformFinancePayerAction("SERVICING_ONLY", "READ_ACCOUNT")).toBe(
      true,
    );
    expect(
      canPerformFinancePayerAction("SERVICING_ONLY", "SETTLE_ISSUED_INVOICE"),
    ).toBe(true);
  });

  it("requires the approval actor to be distinct and present", () => {
    expect(isIndependentFinanceApproval("staff-a", "staff-b")).toBe(true);
    expect(isIndependentFinanceApproval("staff-a", "staff-a")).toBe(false);
    expect(isIndependentFinanceApproval("", "staff-b")).toBe(false);
  });
});
