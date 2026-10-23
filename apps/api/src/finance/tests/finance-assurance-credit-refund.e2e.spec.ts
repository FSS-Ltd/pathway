import { ConflictException, ServiceUnavailableException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { withTenantRlsContext } from "@pathway/db";
import { requireDatabase } from "../../../test-helpers.e2e";
import { FinanceRefundService } from "../finance-refund.service";
import { FinanceStripeRefundSubmissionService } from "../stripe/finance-stripe-refund-submission.service";
import {
  DisabledFinanceStripeRefundProvider,
  type FinanceStripeRefundProvider,
} from "../stripe/finance-stripe-refund.provider";
import { createFinanceAssuranceFixture } from "./finance-assurance.fixture";
import { prepareAssuranceProviderSuccess } from "./finance-assurance-provider.fixture";
import {
  assuranceGate,
  createApprovedAssuranceManualReceipt,
  createThreeUnitAssuranceInvoice,
  prepareFiveThousandCredit,
} from "./finance-assurance-money.fixture";

describe("Finance exact credit/refund and unknown-outcome assurance", () => {
  beforeAll(() => {
    if (!requireDatabase())
      throw new Error("Central disposable database required");
  });

  it("credits and refunds 5000 from a paid 30000 obligation, preserving 25000 charges and allocations with zero outstanding", async () => {
    const f = await createFinanceAssuranceFixture();
    const { invoiceId, lineId } = await createThreeUnitAssuranceInvoice(f);
    const receiptId = await createApprovedAssuranceManualReceipt(f, "30000");
    await f.receipts.allocate(f.actor, receiptId, randomUUID(), {
      invoiceId,
      amountMinor: "30000",
    });
    const credit = await prepareFiveThousandCredit(f, invoiceId, lineId);
    await credit();
    expect((await f.invoices.get(f.actor, invoiceId)).balance).toMatchObject({
      issuedGrossMinor: "30000",
      issuedCreditsMinor: "5000",
      allocatedReceiptsMinor: "30000",
      outstandingMinor: "0",
      creditBalanceMinor: "5000",
    });
    const refunds = new FinanceRefundService(
      f.access,
      f.commands,
      new FinanceStripeRefundSubmissionService(
        new DisabledFinanceStripeRefundProvider(),
      ),
    );
    const refund = await refunds.request(f.actor, receiptId, randomUUID(), {
      amountMinor: "5000",
      reason: "Return the independently credited charge",
    });
    await refunds.approve(f.reviewer, refund.id, randomUUID(), {
      reason: "Reviewed the credit and bank repayment",
    });
    const key = randomUUID();
    const confirmation = { bankTransactionReference: `REFUND-${randomUUID()}` };
    expect(
      (await refunds.confirmManualRefund(f.actor, refund.id, key, confirmation))
        .status,
    ).toBe("CONFIRMED");
    await refunds.confirmManualRefund(f.actor, refund.id, key, confirmation);
    await credit();
    const balance = (await f.invoices.get(f.actor, invoiceId)).balance;
    expect(balance).toEqual({
      issuedGrossMinor: "30000",
      issuedCreditsMinor: "5000",
      allocatedReceiptsMinor: "25000",
      outstandingMinor: "0",
      creditBalanceMinor: "0",
    });
    expect(
      BigInt(balance.issuedGrossMinor) - BigInt(balance.issuedCreditsMinor),
    ).toBe(25000n);
    await withTenantRlsContext(f.tenantId, f.orgId, async (tx) => {
      const where = { tenantId: f.tenantId, orgId: f.orgId };
      expect(
        await tx.financeReceiptMovement.findMany({
          where: { ...where, receiptId },
          select: { type: true, amountMinor: true },
        }),
      ).toEqual([{ type: "REFUND", amountMinor: 5000n }]);
      expect(
        await tx.financeCreditNote.count({
          where: { ...where, invoiceId, status: "ISSUED" },
        }),
      ).toBe(1);
      expect(
        await tx.financeReceipt.count({
          where: { ...where, payerAccountId: f.payer.id },
        }),
      ).toBe(1);
    });
  });

  it("retains an accepted-before-timeout refund reservation while overlapping retries recover one provider refund", async () => {
    const f = await createFinanceAssuranceFixture();
    const invoiceId = await f.createIssuedInvoice("30000");
    await (
      await prepareAssuranceProviderSuccess(f, invoiceId, "card", 30000)
    )();
    const receipt = await withTenantRlsContext(f.tenantId, f.orgId, (tx) =>
      tx.financeReceipt.findFirstOrThrow({
        where: {
          tenantId: f.tenantId,
          orgId: f.orgId,
          payerAccountId: f.payer.id,
        },
      }),
    );
    const accepted = assuranceGate();
    const timeout = assuranceGate();
    const providerObjects = new Map<string, string>();
    const observedRequests: Array<{
      refundId: string;
      amountMinor: bigint;
      creationPermitted: boolean;
    }> = [];
    const refundId = `re_assurance_${randomUUID().replaceAll("-", "")}`;
    const createdAt = new Date();
    const provider: FinanceStripeRefundProvider = {
      async retrieveChargePaymentIntent() {
        throw new Error("Confirmed PaymentIntent must be reused");
      },
      async createRefund(input) {
        observedRequests.push(input);
        expect(input.stripeAccountId).toBe(f.connection.stripeAccountId);
        expect(input.amountMinor).toBe(5000n);
        expect(input.livemode).toBe(false);
        if (!providerObjects.has(input.refundId)) {
          providerObjects.set(input.refundId, refundId);
          accepted.release();
          await timeout.promise;
          throw new Error(
            "Synthetic network timeout after provider accepted refund",
          );
        }
        return {
          id: refundId,
          amountMinor: input.amountMinor,
          currency: input.currency,
          status: "succeeded",
          createdAt,
        };
      },
    };
    const submission = new FinanceStripeRefundSubmissionService(provider);
    const refunds = new FinanceRefundService(f.access, f.commands, submission);
    const refund = await refunds.request(f.actor, receipt.id, randomUUID(), {
      amountMinor: "5000",
      reason: "Synthetic return of overpaid funds",
    });
    const approval = refunds.approve(f.reviewer, refund.id, randomUUID(), {
      reason: "Independent review of repayment",
    });
    // Observe rejection immediately so the delayed original call cannot create
    // an unhandled rejection while independent retry transactions run.
    const approvalOutcome = approval.then(
      (value) => ({ value, error: null }),
      (error: unknown) => ({ value: null, error }),
    );
    try {
      await Promise.race([
        accepted.promise,
        approval.then(() => {
          throw new Error("Expected an unresolved accepted provider refund");
        }),
      ]);
      const reserved = await withTenantRlsContext(f.tenantId, f.orgId, (tx) =>
        tx.financeRefund.findFirstOrThrow({
          where: { id: refund.id, tenantId: f.tenantId, orgId: f.orgId },
        }),
      );
      expect(reserved.status).toBe("APPROVED");
      expect(reserved.providerAttemptStartedAt).not.toBeNull();
      await expect(
        refunds.request(f.actor, receipt.id, randomUUID(), {
          amountMinor: "25001",
          reason: "Must not consume reserved repayment funds",
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      const retries = await Promise.all([
        submission.submit(f.reviewer, refund.id),
        new FinanceStripeRefundSubmissionService(provider).submit(
          f.reviewer,
          refund.id,
        ),
      ]);
      expect(retries.map((result) => result.status)).toEqual([
        "CONFIRMED",
        "CONFIRMED",
      ]);
      expect(providerObjects.size).toBe(1);
      expect(observedRequests.length).toBeGreaterThanOrEqual(2);
      expect(
        observedRequests.every(
          (input) => input.refundId === refund.id && input.creationPermitted,
        ),
      ).toBe(true);
      const confirmed = await withTenantRlsContext(f.tenantId, f.orgId, (tx) =>
        tx.financeRefund.findFirstOrThrow({
          where: { id: refund.id, tenantId: f.tenantId, orgId: f.orgId },
        }),
      );
      expect(confirmed.providerAttemptStartedAt).toEqual(
        reserved.providerAttemptStartedAt,
      );
    } finally {
      timeout.release();
    }
    expect((await approvalOutcome).error).toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect((await submission.submit(f.reviewer, refund.id)).status).toBe(
      "CONFIRMED",
    );
    expect((await f.invoices.get(f.actor, invoiceId)).balance).toMatchObject({
      allocatedReceiptsMinor: "25000",
      outstandingMinor: "5000",
      creditBalanceMinor: "0",
    });
    await withTenantRlsContext(f.tenantId, f.orgId, async (tx) => {
      const where = {
        tenantId: f.tenantId,
        orgId: f.orgId,
        receiptId: receipt.id,
      };
      expect(await tx.financeRefund.count({ where })).toBe(1);
      expect(
        await tx.financeReceiptMovement.findMany({
          where,
          select: { type: true, amountMinor: true },
        }),
      ).toEqual([{ type: "REFUND", amountMinor: 5000n }]);
    });
  });
});
