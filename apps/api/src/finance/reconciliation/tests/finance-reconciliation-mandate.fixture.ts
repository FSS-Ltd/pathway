import { FinanceStripeBacsMandateService } from "../../stripe/finance-stripe-bacs-mandate.service";
import { StripeFinanceMandateServicingProvider } from "../../stripe/finance-stripe-mandate-servicing.provider";
import type { FinanceMandateServicingObject } from "../../stripe/finance-stripe-mandate-servicing.contracts";
import { withReconciliationOperation } from "./finance-reconciliation-operation.fixture";

type BaseFixture = Parameters<
  Parameters<typeof withReconciliationOperation>[0]
>[0];
interface MandateFixture extends BaseFixture {
  mandateId: string;
  payerUserId: string;
  payerAccountId: string;
  setupIntent: Extract<
    FinanceMandateServicingObject,
    { object: "setup_intent" }
  >;
}

export async function withReconciliationMandate(
  check: (fixture: MandateFixture) => Promise<void>,
): Promise<void> {
  await withReconciliationOperation(async (fixture) => {
    const { tx, scope, grantId } = fixture;
    const grant = await tx.financePayerGrant.findUniqueOrThrow({
      where: { id: grantId },
    });
    const service = new FinanceStripeBacsMandateService(
      { async assertPayerAction() {} },
      {
        mode: "test",
        secretKey: "sk_test_fixture",
        webAppUrl: "https://example.test",
      },
      {
        async createCustomer() {
          return { id: "cus_mandate_recovery" };
        },
        async createMandateSetupSession() {
          return {
            id: "cs_mandate_recovery",
            url: "https://checkout.stripe.com/c/pay/fixture",
            expiresAt: new Date(Date.now() + 3_600_000),
          };
        },
        async createDebit() {
          throw new Error("No debit permitted in mandate fixture");
        },
      },
      new StripeFinanceMandateServicingProvider({ mode: "disabled" }),
    );
    const setup = await service.startSetup(
      { ...scope, userId: grant.payerUserId },
      grant.financePayerAccountId,
    );
    const mandate = await tx.financeMandate.findUniqueOrThrow({
      where: { id: setup.mandateId },
    });
    await check({
      ...fixture,
      mandateId: mandate.id,
      payerUserId: grant.payerUserId,
      payerAccountId: grant.financePayerAccountId,
      setupIntent: {
        id: "seti_mandate_recovery",
        object: "setup_intent",
        created: Math.floor(Date.now() / 1000) - 86_400,
        livemode: scope.livemode,
        status: "succeeded",
        customer: "cus_mandate_recovery",
        payment_method: "pm_mandate_recovery",
        mandate: "mandate_recovery",
        metadata: {
          finance_mandate_id: mandate.id,
          finance_payer_account_id: grant.financePayerAccountId,
          finance_consent_version: mandate.consentVersion,
        },
      },
    });
  }, "GBP");
}
