import { REQUIRED_PERMISSION } from "../../access-control/require-permission.decorator";
import { FINANCE_ACCESS_REQUIREMENT } from "../access/finance-access.types";
import { FinanceReconciliationController } from "../finance-reconciliation.controller";

describe("staff reconciliation route gates", () => {
  it.each(["list", "get", "history"] as const)(
    "%s is Finance staff read only",
    (method) => {
      const handler = FinanceReconciliationController.prototype[method];
      expect(Reflect.getMetadata(REQUIRED_PERMISSION, handler)).toBe(
        "finance.invoices.read",
      );
      expect(Reflect.getMetadata(FINANCE_ACCESS_REQUIREMENT, handler)).toEqual({
        kind: "staff",
        action: "READ_RECORDS",
        permission: "finance.invoices.read",
      });
      expect(Reflect.getMetadata("__headers__", handler)).toContainEqual({
        name: "Cache-Control",
        value: "private, no-store",
      });
    },
  );
  it("requires staff reconciliation and payment-management permission for every action", () => {
    expect(
      Reflect.getMetadata(
        FINANCE_ACCESS_REQUIREMENT,
        FinanceReconciliationController.prototype.act,
      ),
    ).toEqual({
      kind: "staff",
      action: "RECONCILE",
      permission: "finance.payments.manage",
    });
  });
});
