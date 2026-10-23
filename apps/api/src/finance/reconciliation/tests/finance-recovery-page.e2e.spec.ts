import { requireDatabase } from "../../../../test-helpers.e2e";
import { FinanceBalanceService } from "../../finance-balance.service";
import { FinanceStripePaymentWebhookService } from "../../stripe/finance-stripe-payment-webhook.service";
import {
  prepareFinanceRecoveryPage,
  type FinanceRecoveryPreparationDependencies,
} from "../finance-recovery-page-preparation";
import { captureFinanceRecoveryPage } from "../finance-recovery-page-capture";
import { withReconciliationOperation } from "./finance-reconciliation-operation.fixture";

const preparation: FinanceRecoveryPreparationDependencies = {
  provider: {
    async retrieve() {
      throw new Error("No supplemental read expected");
    },
  },
  payouts: {
    async listPage() {
      throw new Error("No payout read expected");
    },
  },
  async readPayoutContinuation() {
    return null;
  },
};
describe("registered recovery page dispatch", () => {
  beforeAll(() => {
    if (!requireDatabase())
      throw new Error("Page capture requires a disposable database");
  });
  it("captures a missed Checkout, then observes matched Charge/fees without adding family receipts", async () => {
    await withReconciliationOperation(async ({ tx, scope, checkout }) => {
      const at = new Date();
      const objects = await prepareFinanceRecoveryPage(
        scope,
        "checkoutSessions",
        [checkout],
        preparation,
        at,
      );
      expect(
        await captureFinanceRecoveryPage(
          tx,
          scope,
          "checkoutSessions",
          objects,
          at,
          "capture",
        ),
      ).toEqual({ recoverable: 1, exceptions: 0 });
      const evidence = await tx.financeStripeWebhookEvent.findFirstOrThrow({
        where: { eventType: "checkout.session.completed" },
      });
      await new FinanceStripePaymentWebhookService(
        new FinanceBalanceService(),
      ).process({
        ...scope,
        stripeEventId: evidence.stripeEventId,
        eventType: evidence.eventType,
        payloadJson: evidence.payloadJson,
      });
      const charge = {
        id: "ch_registered",
        object: "charge",
        created: checkout.created,
        livemode: false,
        amount: 2450,
        currency: "eur",
        paid: true,
        captured: true,
        status: "succeeded",
        payment_intent: checkout.payment_intent,
        balance_transaction: "txn_registered",
      };
      const balance = {
        id: "txn_registered",
        object: "balance_transaction",
        created: checkout.created,
        amount: 2450,
        fee: 50,
        net: 2400,
        currency: "eur",
        type: "charge",
        status: "available",
        available_on: checkout.created,
        source: charge.id,
      };
      await captureFinanceRecoveryPage(
        tx,
        scope,
        "charges",
        [{ kind: "ordinary", raw: charge }],
        at,
        "capture",
      );
      await captureFinanceRecoveryPage(
        tx,
        scope,
        "balanceTransactions",
        [{ kind: "ordinary", raw: balance }],
        at,
        "capture",
      );
      expect(
        await tx.financeReceipt.findMany({
          select: { amountMinor: true, source: true },
        }),
      ).toEqual([{ amountMinor: 2450n, source: "STRIPE_CARD" }]);
      expect(
        await tx.financeReceiptAllocation.findMany({
          select: { amountMinor: true },
        }),
      ).toEqual([{ amountMinor: 2450n }]);
      expect(await tx.financeReconciliationCase.count()).toBe(0);
      expect(JSON.stringify(evidence.payloadJson)).not.toContain("private");
    });
  });
  it("reports dry-run matches without inbox, case, state or ledger writes", async () => {
    await withReconciliationOperation(async ({ tx, scope, checkout }) => {
      const at = new Date();
      const objects = await prepareFinanceRecoveryPage(
        scope,
        "checkoutSessions",
        [checkout],
        preparation,
        at,
      );
      expect(
        await captureFinanceRecoveryPage(
          tx,
          scope,
          "checkoutSessions",
          objects,
          at,
          "dry-run",
        ),
      ).toEqual({ recoverable: 1, exceptions: 0 });
      expect(await tx.financeStripeWebhookEvent.count()).toBe(0);
      expect(await tx.financeReconciliationCase.count()).toBe(0);
      expect(await tx.financeReconciliationState.count()).toBe(0);
      expect(await tx.financeReceipt.count()).toBe(0);
    });
  });
  it("retains only minimal setup Checkout observation without a payment receipt", async () => {
    await withReconciliationOperation(async ({ tx, scope, checkout }) => {
      const at = new Date();
      const raw = {
        ...checkout,
        mode: "setup",
        customer_details: { email: "private@example.test" },
        client_secret: "private",
      };
      expect(
        await captureFinanceRecoveryPage(
          tx,
          scope,
          "checkoutSessions",
          [{ kind: "ordinary", raw }],
          at,
          "capture",
        ),
      ).toEqual({ recoverable: 0, exceptions: 0 });
      const evidence = await tx.financeStripeWebhookEvent.findFirstOrThrow();
      expect(evidence.status).toBe("COMPLETED");
      expect(JSON.stringify(evidence.payloadJson)).not.toContain("private");
      expect(await tx.financeReconciliationCase.count()).toBe(0);
      expect(await tx.financeReceipt.count()).toBe(0);
    });
  });
});
