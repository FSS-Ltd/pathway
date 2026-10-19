import { REQUIRED_PERMISSION } from "../../access-control/require-permission.decorator";
import { FinanceRefundController } from "../finance-refund.controller";

describe("FinanceRefundController approval permissions", () => {
  it.each(["approve", "reject"] as const)(
    "%s requires the Finance approval permission",
    (handlerName) => {
      const permission = Reflect.getMetadata(
        REQUIRED_PERMISSION,
        FinanceRefundController.prototype[handlerName],
      );

      expect(permission).toBe("finance.approvals.review");
    },
  );

  it("uses the payment management permission when creating a refund request", () => {
    const permission = Reflect.getMetadata(
      REQUIRED_PERMISSION,
      FinanceRefundController.prototype.request,
    );

    expect(permission).toBe("finance.payments.manage");
  });

  it.each(["requestManualReturn", "confirmManual"] as const)(
    "%s requires the payment management permission",
    (handlerName) => {
      const permission = Reflect.getMetadata(
        REQUIRED_PERMISSION,
        FinanceRefundController.prototype[handlerName],
      );

      expect(permission).toBe("finance.payments.manage");
    },
  );

  it.each(["approveManualReturn", "rejectManualReturn"] as const)(
    "%s requires the Finance approval permission",
    (handlerName) => {
      const permission = Reflect.getMetadata(
        REQUIRED_PERMISSION,
        FinanceRefundController.prototype[handlerName],
      );

      expect(permission).toBe("finance.approvals.review");
    },
  );
});
