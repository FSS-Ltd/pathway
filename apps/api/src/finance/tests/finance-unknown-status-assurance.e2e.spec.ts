import { withTenantRlsContext } from "@pathway/db";
import { requireDatabase } from "../../../test-helpers.e2e";
import { runFinanceRecoveryRequest } from "../reconciliation/finance-recovery-runtime";
import type { FinanceReconciliationStream } from "../stripe/finance-stripe-reconciliation.provider";
import { createFinanceAssuranceFixture } from "./finance-assurance.fixture";

const cases = [
  {
    stream: "paymentIntents",
    object: "payment_intent",
    prefix: "pi",
    held: true,
  },
  { stream: "refunds", object: "refund", prefix: "re", held: true },
  {
    stream: "setupIntents",
    object: "setup_intent",
    prefix: "seti",
    held: false,
  },
  { stream: "charges", object: "charge", prefix: "ch", held: false },
  {
    stream: "balanceTransactions",
    object: "balance_transaction",
    prefix: "txn",
    held: false,
  },
  { stream: "payouts", object: "payout", prefix: "po", held: false },
] satisfies Array<{
  stream: FinanceReconciliationStream;
  object: string;
  prefix: string;
  held: boolean;
}>;

// The transport supplies a future provider status. Public recovery, durable
// cursor/retry state, exception capture and the family ledger are real.
describe("unknown current provider statuses through durable recovery", () => {
  beforeAll(() => {
    if (!requireDatabase())
      throw new Error(
        "Unknown-status assurance requires the central disposable database",
      );
  });

  it.each(cases)(
    "never treats an unknown $stream status as confirmed money",
    async ({ stream, object, prefix, held }) => {
      const f = await createFinanceAssuranceFixture();
      const invoiceId = await f.createIssuedInvoice("500");
      const now = new Date(Date.now() + 1000);
      const resourceId = `${prefix}_futurestatus`;
      const raw = {
        id: resourceId,
        object,
        created: Math.floor(now.getTime() / 1000) - 1,
        livemode: false,
        status: "future_provider_status",
        amount: 500,
        fee: 0,
        net: 500,
        currency: "gbp",
        customer: "cus_synthetic",
        payment_method: "pm_synthetic",
        payment_intent: "pi_synthetic",
        charge: "ch_synthetic",
        mandate: null,
        metadata: {},
        paid: true,
        captured: true,
        automatic: true,
        arrival_date: Math.floor(now.getTime() / 1000),
        available_on: Math.floor(now.getTime() / 1000),
        balance_transaction: null,
        source: "ch_synthetic",
        type: "charge",
      };
      let providerReads = 0;
      const result = await runFinanceRecoveryRequest(
        {
          tenantId: f.tenantId,
          orgId: f.orgId,
          connectionId: f.connection.id,
          stream,
          mode: "sync",
        },
        {
          mode: "test",
          secretKey: "sk_test_synthetic_no_network",
        },
        {
          clock: () => now,
          fetcher: async (input, options) => {
            const url = new URL(String(input));
            expect(url.origin).toBe("https://api.stripe.com");
            expect(raw.created).toBeGreaterThanOrEqual(
              Number(url.searchParams.get("created[gte]")),
            );
            expect(raw.created).toBeLessThan(
              Number(url.searchParams.get("created[lt]")),
            );
            expect(options?.method ?? "GET").toBe("GET");
            const headers = new Headers(options?.headers);
            expect(headers.get("Stripe-Account")).toBe(
              f.connection.stripeAccountId,
            );
            expect(headers.get("Stripe-Version")).toBe("2026-09-30.endive");
            providerReads++;
            return Response.json({
              object: "list",
              data: [raw],
              has_more: false,
            });
          },
        },
      );
      expect(providerReads).toBe(1);
      expect(result).toMatchObject(
        held
          ? { status: "completed", recoverable: 0, exceptions: 1 }
          : { status: "failed", recoverable: 0 },
      );
      await withTenantRlsContext(f.tenantId, f.orgId, async (tx) => {
        const scope = { tenantId: f.tenantId, orgId: f.orgId };
        expect(await tx.financeReceipt.count({ where: scope })).toBe(0);
        expect(await tx.financeReceiptAllocation.count({ where: scope })).toBe(
          0,
        );
        expect(await tx.financeReceiptMovement.count({ where: scope })).toBe(0);
        const invoice = await tx.financeInvoice.findUniqueOrThrow({
          where: { id: invoiceId },
        });
        expect(
          (await f.balances.forInvoices(tx, f.actor, [invoice])).get(invoiceId)
            ?.outstandingMinor,
        ).toBe("500");
        const state = await tx.financeReconciliationState.findFirstOrThrow({
          where: { ...scope, stripeConnectionId: f.connection.id, stream },
        });
        if (held) {
          expect(
            await tx.financeReconciliationCase.findFirst({
              where: { ...scope, resourceReference: resourceId },
              select: { kind: true, status: true, details: true },
            }),
          ).toMatchObject({
            kind: "UNKNOWN_OPERATION",
            status: "OPEN",
            details: { fundsConfirmed: false },
          });
          expect(
            await tx.financeStripeWebhookEvent.findMany({
              where: scope,
              select: { status: true },
            }),
          ).toEqual([{ status: "AWAITING_HANDLER" }]);
        } else {
          expect(state.lastSucceededAt).toBeNull();
          expect(state.lastError).not.toBeNull();
          expect(state.retryAfter?.getTime()).toBeGreaterThan(now.getTime());
          expect(state.leaseToken).toBeNull();
          expect(
            await tx.financeStripeWebhookEvent.count({ where: scope }),
          ).toBe(0);
        }
      });
    },
  );
});
