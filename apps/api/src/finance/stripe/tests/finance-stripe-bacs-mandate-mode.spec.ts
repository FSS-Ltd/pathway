import type { FinanceAccessService } from "../../access/finance-access.service";
import type { FinanceStripeCheckoutConfig } from "../finance-stripe-checkout.config";
import type { FinanceStripeBacsProvider } from "../finance-stripe-bacs.provider";
import { FinanceStripeBacsMandateService } from "../finance-stripe-bacs-mandate.service";
import type { FinanceStripeMandateServicingProvider } from "../finance-stripe-mandate-servicing.contracts";

jest.mock("@pathway/db", () => ({
  withTenantRlsContext: jest.fn(),
  runTransaction: jest.fn(),
}));

describe("FinanceStripeBacsMandateService collection mode", () => {
  const actor = { tenantId: "tenant-a", orgId: "org-a", userId: "payer-user" };
  const reachedAccessCheck = new Error("reached payer access check");

  function serviceFor(mode: "test" | "live" | "disabled") {
    const assertPayerAction = jest.fn().mockRejectedValue(reachedAccessCheck);
    const service = new FinanceStripeBacsMandateService(
      { assertPayerAction } as unknown as FinanceAccessService,
      { mode } as unknown as FinanceStripeCheckoutConfig,
      {} as FinanceStripeBacsProvider,
      {} as FinanceStripeMandateServicingProvider,
    );
    return { service, assertPayerAction };
  }

  it("does not start mandate setup when collection is disabled", async () => {
    const { service, assertPayerAction } = serviceFor("disabled");
    await expect(service.startSetup(actor, "payer-1")).rejects.toMatchObject({
      status: 503,
    });
    expect(assertPayerAction).not.toHaveBeenCalled();
  });

  it.each(["test", "live"] as const)(
    "starts mandate setup in %s mode by checking the payer's access",
    async (mode) => {
      const { service, assertPayerAction } = serviceFor(mode);
      await expect(service.startSetup(actor, "payer-1")).rejects.toBe(
        reachedAccessCheck,
      );
      expect(assertPayerAction).toHaveBeenCalledTimes(1);
    },
  );
});
