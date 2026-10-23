import { randomUUID } from "node:crypto";
import { withTenantRlsContext } from "@pathway/db";
import { requireDatabase } from "../../../test-helpers.e2e";
import { FinanceReportRepository } from "../finance-report.repository";
import { captureFinanceSettlementObservation } from "../reconciliation/finance-settlement.persistence";
import { FinanceSettlementReportRepository } from "../reconciliation/finance-settlement-report.repository";
import { createFinanceAssuranceFixture } from "./finance-assurance.fixture";
import { prepareAssuranceProviderSuccess } from "./finance-assurance-provider.fixture";

// A01 uses provider evidence fixtures, real canonical posting and both persisted
// report repositories. It does not claim Stripe charged this example fee.
describe("Finance principal and processor fee assurance", () => {
  beforeAll(() => {
    if (!requireDatabase())
      throw new Error(
        "Principal/fee assurance requires the central disposable database",
      );
  });

  it("keeps a 30000 receipt and zero debt separate from a 470 fee and 29530 net", async () => {
    const f = await createFinanceAssuranceFixture();
    const invoiceId = await f.createIssuedInvoice("30000");
    const confirm = await prepareAssuranceProviderSuccess(
      f,
      invoiceId,
      "card",
      30000,
    );
    await confirm();
    await confirm();
    const accountId = f.connection.stripeAccountId;
    if (!accountId) throw new Error("Synthetic provider account required");
    const scope = {
      tenantId: f.tenantId,
      orgId: f.orgId,
      connectionId: f.connection.id,
      stripeAccountId: accountId,
      livemode: false,
    };
    const now = new Date();
    const created = Math.floor(now.getTime() / 1000) - 1;
    const suffix = randomUUID().replaceAll("-", "");
    const chargeId = `ch_${suffix}`;
    const transactionId = `txn_${suffix}`;
    const fee = {
      id: transactionId,
      object: "balance_transaction",
      created,
      amount: 30000,
      fee: 470,
      net: 29530,
      currency: "gbp",
      type: "charge",
      status: "available",
      available_on: created,
      source: chargeId,
    };
    await withTenantRlsContext(f.tenantId, f.orgId, async (tx) => {
      const attempt = await tx.financeCheckoutAttempt.findFirstOrThrow({
        where: {
          tenantId: f.tenantId,
          orgId: f.orgId,
          invoiceId,
          status: "PAID",
        },
      });
      const charge = {
        id: chargeId,
        object: "charge",
        created,
        livemode: false,
        amount: 30000,
        currency: "gbp",
        paid: true,
        captured: true,
        status: "succeeded",
        payment_intent: attempt.stripePaymentIntentId,
        balance_transaction: transactionId,
      };
      for (let replay = 0; replay < 2; replay++) {
        expect(
          await captureFinanceSettlementObservation(
            tx,
            scope,
            "charges",
            charge,
            now,
          ),
        ).toEqual({ recoverable: 0, exceptions: 0 });
        expect(
          await captureFinanceSettlementObservation(
            tx,
            scope,
            "balanceTransactions",
            fee,
            now,
          ),
        ).toEqual({ recoverable: 0, exceptions: 0 });
      }
      expect(
        await tx.financeSettlementEvidence.findMany({
          where: {
            tenantId: f.tenantId,
            orgId: f.orgId,
            stripeConnectionId: f.connection.id,
            resourceType: "balance_transaction",
            providerReference: transactionId,
          },
          select: { facts: true },
        }),
      ).toEqual([
        {
          facts: expect.objectContaining({
            amount: 30000,
            fee: 470,
            net: 29530,
            currency: "GBP",
          }),
        },
      ]);
      expect(
        await tx.financeReceipt.count({
          where: { tenantId: f.tenantId, orgId: f.orgId },
        }),
      ).toBe(1);
      expect(
        await tx.financeReceiptAllocation.findMany({
          where: { tenantId: f.tenantId, orgId: f.orgId, invoiceId },
          select: { amountMinor: true },
        }),
      ).toEqual([{ amountMinor: 30000n }]);
    });
    const day = now.toISOString().slice(0, 10);
    const filters = { from: day, to: day, asOf: day };
    const family = await new FinanceReportRepository(f.balances).loadSnapshot(
      f.actor,
      filters,
    );
    expect(family.totals).toMatchObject({
      issuedGrossMinor: "30000",
      confirmedReceiptsMinor: "30000",
      allocatedReceiptsMinor: "30000",
      outstandingMinor: "0",
      unappliedMinor: "0",
    });
    const settlement = await new FinanceSettlementReportRepository().load(
      f.actor,
      { id: f.connection.id, accountId, livemode: false },
      filters,
      new Date(now.getTime() + 1000),
    );
    expect(settlement.feesByCurrency).toEqual([
      { currency: "GBP", amountMinor: "470" },
    ]);
    expect(settlement.payouts).toEqual([]);
    expect((await f.invoices.get(f.actor, invoiceId)).balance).toMatchObject({
      allocatedReceiptsMinor: "30000",
      outstandingMinor: "0",
      creditBalanceMinor: "0",
    });
  });
});
