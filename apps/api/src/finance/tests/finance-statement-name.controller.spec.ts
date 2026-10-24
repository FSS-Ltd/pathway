import { REQUIRED_PERMISSION } from "../../access-control/require-permission.decorator";
import { FINANCE_ACCESS_REQUIREMENT } from "../access/finance-access.types";
import { FinanceStatementNameController } from "../finance-statement-name.controller";

describe("statement name route", () => {
  it("requires staff Finance payment read and prevents response caching", () => {
    const handler = FinanceStatementNameController.prototype.get;
    expect(Reflect.getMetadata(REQUIRED_PERMISSION, handler)).toBe(
      "finance.payments.read",
    );
    expect(Reflect.getMetadata(FINANCE_ACCESS_REQUIREMENT, handler)).toEqual({
      kind: "staff",
      action: "READ_RECORDS",
      permission: "finance.payments.read",
    });
    expect(Reflect.getMetadata("__headers__", handler)).toContainEqual({
      name: "Cache-Control",
      value: "private, no-store",
    });
  });
});
