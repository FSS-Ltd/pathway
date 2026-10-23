import * as receiptExceptions from "../../finance-receipt-exception.persistence";
import type { Prisma } from "@pathway/db";
import { requireDatabase } from "../../../../test-helpers.e2e";
import { FinanceBalanceService } from "../../finance-balance.service";
import { FinanceStripePaymentWebhookService } from "../../stripe/finance-stripe-payment-webhook.service";
import { FinanceStripeReversalWebhookService } from "../../stripe/finance-stripe-reversal-webhook.service";
import { findReceiptForPaymentIntent } from "../../stripe/finance-stripe-reversal-webhook.persistence";
import type { FinanceStripeRefundProvider } from "../../stripe/finance-stripe-refund.provider";
import type { FinanceReconciliationObject } from "../../stripe/finance-stripe-reconciliation.provider";
import { recoverFinanceCheckout } from "../finance-checkout-recovery.persistence";
import { recoverFinanceReversal } from "../finance-reversal-recovery.persistence";
import type { FinanceConnectionScope } from "../finance-reconciliation.types";
import { withReconciliationOperation } from "./finance-reconciliation-operation.fixture";

const noProviderWrites: FinanceStripeRefundProvider = {
  async retrieveChargePaymentIntent() {
    throw new Error(
      "Fixture already has a verified PaymentIntent; no provider request expected",
    );
  },
  async createRefund() {
    throw new Error("Recovery must never create a provider refund");
  },
};
const reversals = new FinanceStripeReversalWebhookService(noProviderWrites);

function intentId(checkout: FinanceReconciliationObject): string {
  if (typeof checkout.payment_intent !== "string")
    throw new Error("Missing fixture PaymentIntent");
  return checkout.payment_intent;
}

async function replay(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
  eventType: string,
): Promise<void> {
  const evidence = await tx.financeStripeWebhookEvent.findFirstOrThrow({
    where: { tenantId: scope.tenantId, orgId: scope.orgId, eventType },
  });
  const input = {
    tenantId: scope.tenantId,
    orgId: scope.orgId,
    stripeEventId: evidence.stripeEventId,
    stripeAccountId: evidence.stripeAccountId,
    livemode: evidence.livemode,
    eventType: evidence.eventType,
    payloadJson: evidence.payloadJson,
  };
  const result =
    eventType === "checkout.session.completed"
      ? await new FinanceStripePaymentWebhookService(
          new FinanceBalanceService(),
        ).process(input)
      : await reversals.process(input);
  expect(result).toBe("processed");
}

async function postOriginal(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
  checkout: FinanceReconciliationObject,
): Promise<void> {
  await recoverFinanceCheckout(tx, scope, checkout, new Date(), "capture");
  await replay(tx, scope, "checkout.session.completed");
}

function refund(
  checkout: FinanceReconciliationObject,
): FinanceReconciliationObject {
  return {
    id: "re_recovered",
    object: "refund",
    created: Math.floor(Date.now() / 1000),
    status: "succeeded",
    amount: 1000,
    currency: "eur",
    payment_intent: intentId(checkout),
    charge: "py_synthetic",
    metadata: null,
  };
}

function dispute(
  checkout: FinanceReconciliationObject,
): FinanceReconciliationObject {
  const created = Math.floor(Date.now() / 1000);
  return {
    id: "du_recovered",
    object: "dispute",
    created,
    livemode: false,
    amount: 2450,
    currency: "eur",
    payment_intent: intentId(checkout),
    charge: "py_synthetic",
    status: "lost",
    balance_transactions: [
      {
        id: "txn_withdrawal",
        object: "balance_transaction",
        created,
        amount: -2450,
        currency: "eur",
        fee: 1500,
        net: -3950,
      },
    ],
  };
}

describe("canonical recovered refunds and dispute movements", () => {
  it("retains distinct unresolved reversals at the provider identifier length limit", async () => {
    await withReconciliationOperation(async ({ tx, scope, checkout }) => {
      const ids = ["x", "y"].map((end) => `re_${"a".repeat(251)}${end}`);
      for (const id of ids)
        await recoverFinanceReversal(
          tx,
          scope,
          "refunds",
          { ...refund(checkout), id },
          new Date(),
          "capture",
        );
      const cases = await tx.financeReconciliationCase.findMany({
        where: { tenantId: scope.tenantId, orgId: scope.orgId },
        select: { caseKey: true, resourceReference: true },
      });
      expect(cases).toHaveLength(2);
      expect(cases.map((row) => row.resourceReference).sort()).toEqual(ids);
      expect(cases.every((row) => row.caseKey.length <= 255)).toBe(true);
    });
  });
  beforeAll(() => {
    if (!requireDatabase())
      throw new Error("Reversal recovery requires a disposable database");
  });

  it("distinguishes an unknown pending operation from confirmed unmatched money", async () => {
    await withReconciliationOperation(async ({ tx, scope, checkout }) => {
      const original = refund(checkout);
      await recoverFinanceReversal(
        tx,
        scope,
        "refunds",
        { ...original, status: "pending" },
        new Date(),
        "capture",
      );
      await recoverFinanceReversal(
        tx,
        scope,
        "refunds",
        original,
        new Date(),
        "capture",
      );
      expect(
        await tx.financeReconciliationCase.findMany({
          where: { tenantId: scope.tenantId, orgId: scope.orgId },
          orderBy: { kind: "asc" },
          select: { kind: true },
        }),
      ).toEqual([{ kind: "UNKNOWN_OPERATION" }, { kind: "UNMATCHED_MONEY" }]);
      expect(
        await tx.financeReceiptMovement.count({
          where: { tenantId: scope.tenantId, orgId: scope.orgId },
        }),
      ).toBe(0);
    });
  });

  it("keeps an explicit coverage gap when a failed refund has processor reversal evidence but no proved family refund", async () => {
    await withReconciliationOperation(async ({ tx, scope, checkout }) => {
      await postOriginal(tx, scope, checkout);
      await recoverFinanceReversal(
        tx,
        scope,
        "refunds",
        {
          ...refund(checkout),
          status: "failed",
          balance_transaction: "txn_refund",
          failure_balance_transaction: "txn_refund_return",
        },
        new Date(),
        "capture",
      );
      await replay(tx, scope, "refund.failed");
      expect(
        await tx.financeReceiptMovement.count({
          where: { tenantId: scope.tenantId, orgId: scope.orgId },
        }),
      ).toBe(0);
      expect(
        await tx.financeReconciliationCase.findFirst({
          where: {
            tenantId: scope.tenantId,
            orgId: scope.orgId,
            kind: "COVERAGE_GAP",
          },
          select: { status: true, resourceReference: true },
        }),
      ).toEqual({ status: "OPEN", resourceReference: "re_recovered" });
    });
  });

  it("does not match a receipt belonging to another provider environment", async () => {
    await withReconciliationOperation(async ({ tx, scope, checkout }) => {
      await postOriginal(tx, scope, checkout);
      expect(
        await findReceiptForPaymentIntent(
          tx,
          { ...scope, livemode: true },
          scope.stripeAccountId,
          intentId(checkout),
        ),
      ).toBeNull();
    });
  });

  it.each(["refund-first", "return-first"] as const)(
    "flags refund plus bank return in %s order without adding processor fees to debt",
    async (order) => {
      await withReconciliationOperation(
        async ({ tx, scope, checkout, invoiceId }) => {
          await postOriginal(tx, scope, checkout);
          const entries =
            order === "refund-first"
              ? ([
                  ["refunds", refund(checkout), "refund.updated"],
                  [
                    "disputes",
                    dispute(checkout),
                    "charge.dispute.funds_withdrawn",
                  ],
                ] as const)
              : ([
                  [
                    "disputes",
                    dispute(checkout),
                    "charge.dispute.funds_withdrawn",
                  ],
                  ["refunds", refund(checkout), "refund.updated"],
                ] as const);
          for (const [stream, object, eventType] of entries) {
            expect(
              await recoverFinanceReversal(
                tx,
                scope,
                stream,
                object,
                new Date(),
                "capture",
              ),
            ).toEqual({ recoverable: 1, exceptions: 0 });
            await replay(tx, scope, eventType);
          }
          await replay(tx, scope, "refund.updated");
          await replay(tx, scope, "charge.dispute.funds_withdrawn");
          expect(
            await tx.financeReceiptMovement.findMany({
              where: { tenantId: scope.tenantId, orgId: scope.orgId },
              orderBy: { amountMinor: "asc" },
              select: { type: true, amountMinor: true },
            }),
          ).toEqual([
            { type: "REFUND", amountMinor: 1000n },
            { type: "DISPUTE_WITHDRAWAL", amountMinor: 2450n },
          ]);
          const exceptions = await tx.financeReconciliationCase.findMany({
            where: {
              tenantId: scope.tenantId,
              orgId: scope.orgId,
              kind: "REFUND_AND_RETURN",
            },
          });
          expect(exceptions).toHaveLength(1);
          expect(exceptions[0]).toMatchObject({
            status: "OPEN",
            stripeConnectionId: scope.connectionId,
            details: {
              confirmedRefundMinor: "1000",
              confirmedReturnMinor: "2450",
              excessMinor: "1000",
            },
          });
          const balances = await new FinanceBalanceService().forInvoices(
            tx,
            scope,
            [{ id: invoiceId, status: "ISSUED", totalMinor: 2450n }],
          );
          expect(balances.get(invoiceId)?.outstandingMinor).toBe("2450");
        },
      );
    },
  );

  it("flags a historical combined ledger when duplicate canonical evidence is replayed", async () => {
    await withReconciliationOperation(async ({ tx, scope, checkout }) => {
      await postOriginal(tx, scope, checkout);
      // Simulate pre-T17 history using real ledger writers, with only the new detector absent.
      const detector = jest
        .spyOn(receiptExceptions, "reconcileFinanceReceiptException")
        .mockResolvedValue(undefined);
      try {
        await recoverFinanceReversal(
          tx,
          scope,
          "refunds",
          refund(checkout),
          new Date(),
          "capture",
        );
        await replay(tx, scope, "refund.updated");
        await recoverFinanceReversal(
          tx,
          scope,
          "disputes",
          dispute(checkout),
          new Date(),
          "capture",
        );
        await replay(tx, scope, "charge.dispute.funds_withdrawn");
      } finally {
        detector.mockRestore();
      }
      expect(
        await tx.financeReconciliationCase.count({
          where: { tenantId: scope.tenantId, kind: "REFUND_AND_RETURN" },
        }),
      ).toBe(0);
      await replay(tx, scope, "charge.dispute.funds_withdrawn");
      await replay(tx, scope, "refund.updated");
      expect(
        await tx.financeReconciliationCase.count({
          where: {
            tenantId: scope.tenantId,
            kind: "REFUND_AND_RETURN",
            status: "OPEN",
          },
        }),
      ).toBe(1);
      expect(
        await tx.financeReceiptMovement.count({
          where: { tenantId: scope.tenantId },
        }),
      ).toBe(2);
    });
  });
  it("reconstructs withdrawal and reinstatement from current dispute transaction evidence", async () => {
    await withReconciliationOperation(
      async ({ tx, scope, checkout, invoiceId }) => {
        await postOriginal(tx, scope, checkout);
        const current = dispute(checkout);
        const movements = current.balance_transactions;
        if (!Array.isArray(movements))
          throw new Error("Missing fixture movement");
        current.balance_transactions = [
          ...movements,
          {
            id: "txn_reinstated",
            object: "balance_transaction",
            created: current.created,
            amount: 2450,
            currency: "eur",
            fee: -1500,
            net: 3950,
          },
        ];
        current.status = "won";
        await recoverFinanceReversal(
          tx,
          scope,
          "disputes",
          current,
          new Date(),
          "capture",
        );
        await replay(tx, scope, "charge.dispute.funds_withdrawn");
        await replay(tx, scope, "charge.dispute.funds_reinstated");
        expect(
          await tx.financeReceiptMovement.count({
            where: { tenantId: scope.tenantId, orgId: scope.orgId },
          }),
        ).toBe(2);
        const balances = await new FinanceBalanceService().forInvoices(
          tx,
          scope,
          [{ id: invoiceId, status: "ISSUED", totalMinor: 2450n }],
        );
        expect(balances.get(invoiceId)?.outstandingMinor).toBe("0");
      },
    );
  });

  it("retains a refund and its confirmed return as distinct movements", async () => {
    await withReconciliationOperation(
      async ({ tx, scope, checkout, invoiceId }) => {
        await postOriginal(tx, scope, checkout);
        const original = refund(checkout);
        await recoverFinanceReversal(
          tx,
          scope,
          "refunds",
          original,
          new Date(),
          "capture",
        );
        await replay(tx, scope, "refund.updated");
        await recoverFinanceReversal(
          tx,
          scope,
          "refunds",
          {
            ...original,
            status: "failed",
            balance_transaction: "txn_refund",
            failure_balance_transaction: "txn_refund_return",
          },
          new Date(),
          "capture",
        );
        await replay(tx, scope, "refund.failed");
        expect(
          await tx.financeReceiptMovement.findMany({
            where: { tenantId: scope.tenantId, orgId: scope.orgId },
            orderBy: { type: "asc" },
            select: { type: true, amountMinor: true },
          }),
        ).toEqual([
          { type: "REFUND", amountMinor: 1000n },
          { type: "REFUND_RETURN", amountMinor: 1000n },
        ]);
        const balances = await new FinanceBalanceService().forInvoices(
          tx,
          scope,
          [{ id: invoiceId, status: "ISSUED", totalMinor: 2450n }],
        );
        expect(balances.get(invoiceId)?.outstandingMinor).toBe("0");
        expect(
          await tx.financeReconciliationCase.findMany({
            where: {
              tenantId: scope.tenantId,
              orgId: scope.orgId,
              resourceReference: original.id,
              details: {
                path: ["reason"],
                equals: "EXTERNAL_REFUND_PENDING_TREATMENT",
              },
            },
            select: { status: true },
          }),
        ).toEqual([{ status: "RESOLVED" }]);
      },
    );
  });

  it("does not record evidence or change ledger rows during a dry run", async () => {
    await withReconciliationOperation(async ({ tx, scope, checkout }) => {
      await postOriginal(tx, scope, checkout);
      const before = await tx.financeStripeWebhookEvent.count({
        where: { tenantId: scope.tenantId, orgId: scope.orgId },
      });
      expect(
        await recoverFinanceReversal(
          tx,
          scope,
          "refunds",
          refund(checkout),
          new Date(),
          "dry-run",
        ),
      ).toEqual({ recoverable: 1, exceptions: 0 });
      expect(
        await tx.financeStripeWebhookEvent.count({
          where: { tenantId: scope.tenantId, orgId: scope.orgId },
        }),
      ).toBe(before);
      expect(
        await tx.financeReceiptMovement.count({
          where: { tenantId: scope.tenantId, orgId: scope.orgId },
        }),
      ).toBe(0);
    });
  });

  it("reports the same missing refund-history exception in a dry run without writing a case", async () => {
    await withReconciliationOperation(async ({ tx, scope, checkout }) => {
      await postOriginal(tx, scope, checkout);
      expect(
        await recoverFinanceReversal(
          tx,
          scope,
          "refunds",
          {
            ...refund(checkout),
            status: "failed",
            balance_transaction: "txn_refund",
            failure_balance_transaction: "txn_return",
          },
          new Date(),
          "dry-run",
        ),
      ).toEqual({ recoverable: 1, exceptions: 1 });
      expect(
        await tx.financeReconciliationCase.count({
          where: { tenantId: scope.tenantId, orgId: scope.orgId },
        }),
      ).toBe(0);
    });
  });
});
