import { ConflictException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { withTenantRlsContext } from "@pathway/db";
import { requireDatabase } from "../../../test-helpers.e2e";
import { FinanceAccessService } from "../access/finance-access.service";
import { FinanceBalanceService } from "../finance-balance.service";
import { FinanceCommandService } from "../finance-command.service";
import { FinanceInvoiceService } from "../finance-invoice.service";
import { FinanceReceiptService } from "../finance-receipt.service";
import { FinanceStripePaymentWebhookService } from "../stripe/finance-stripe-payment-webhook.service";

function requiredFixture(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Finance receipt test requires ${name}`);
  return value;
}

const tenantId = requiredFixture("E2E_TENANT_ID");
const orgId = requiredFixture("E2E_ORG_ID");

describe("Finance receipt allocation concurrency", () => {
  it("serializes manual and provider-confirmed receipts against one invoice", async () => {
    if (!requireDatabase()) return;

    const creatorId = randomUUID();
    const reviewerId = randomUUID();
    const payerUserId = randomUUID();
    const receiptIds = [randomUUID(), randomUUID()] as const;
    const checkoutAttemptIds = [randomUUID(), randomUUID()] as const;
    const checkoutSessionIds = [
      `cs_race_${randomUUID()}`,
      `cs_race_${randomUUID()}`,
    ] as const;
    const checkoutFixtures = [
      [checkoutAttemptIds[0], checkoutSessionIds[0]],
      [checkoutAttemptIds[1], checkoutSessionIds[1]],
    ] as const;
    const stripeAccountId = `acct_${randomUUID().replaceAll("-", "")}`;
    const idempotencyKeys = [
      `allocate-race-a-${randomUUID()}`,
      `allocate-race-b-${randomUUID()}`,
    ] as const;
    const access = {
      assertStaffAction: jest.fn().mockResolvedValue(undefined),
      authorizeIndependentFinanceApproval: jest
        .fn()
        .mockResolvedValue(undefined),
    } as unknown as FinanceAccessService;
    const commands = new FinanceCommandService();
    const balances = new FinanceBalanceService();
    const invoices = new FinanceInvoiceService(access, commands, balances);
    const receipts = new FinanceReceiptService(access, commands, balances);
    const paymentWebhooks = new FinanceStripePaymentWebhookService(balances);
    const actor = { tenantId, orgId, userId: creatorId };
    let fixture:
      | {
          profileId: string;
          payerId: string;
          payerGrantId: string;
          stripeConnectionId: string;
          invoiceId: string;
          previousInvoiceNumber: bigint | null;
          createdProfile: boolean;
        }
      | undefined;

    try {
      fixture = await withTenantRlsContext(tenantId, orgId, async (tx) => {
        await tx.user.createMany({
          data: [
            {
              id: creatorId,
              email: `finance-race-creator-${creatorId}@example.test`,
            },
            {
              id: reviewerId,
              email: `finance-race-reviewer-${reviewerId}@example.test`,
            },
            {
              id: payerUserId,
              email: `finance-race-payer-${payerUserId}@example.test`,
            },
          ],
        });
        let profile = await tx.financeProfile.findUnique({
          where: { tenantId_orgId: { tenantId, orgId } },
          select: { id: true },
        });
        const createdProfile = !profile;
        if (!profile) {
          profile = await tx.financeProfile.create({
            data: {
              tenantId,
              orgId,
              legalEntityName: "Finance receipt race test school",
            },
            select: { id: true },
          });
        }
        const previousSequence =
          await tx.financeInvoiceNumberSequence.findUnique({
            where: {
              financeProfileId_tenantId_orgId: {
                financeProfileId: profile.id,
                tenantId,
                orgId,
              },
            },
            select: { lastIssuedNumber: true },
          });
        const payer = await tx.financePayerAccount.create({
          data: {
            financeProfileId: profile.id,
            tenantId,
            orgId,
            displayName: "Finance receipt race family",
          },
        });
        const payerGrant = await tx.financePayerGrant.create({
          data: {
            financePayerAccountId: payer.id,
            tenantId,
            orgId,
            payerUserId,
            grantedByUserId: creatorId,
          },
        });
        const stripeConnection = await tx.financeStripeConnection.create({
          data: {
            financeProfileId: profile.id,
            tenantId,
            orgId,
            stripeAccountId,
            status: "READY",
            livemode: false,
            requestedByUserId: creatorId,
          },
        });
        const draft = await invoices.createDraft(
          actor,
          `race-invoice-create-${randomUUID()}`,
          {
            payerAccountId: payer.id,
            dueDate: "2026-11-15",
            lines: [
              {
                description: "Race test fee",
                quantity: "1.000",
                unitAmountMinor: "500",
                taxRateBasisPoints: 0,
              },
            ],
          },
        );
        await invoices.submitForReview(
          actor,
          draft.id,
          `race-invoice-review-${randomUUID()}`,
        );
        await invoices.approve(
          { tenantId, orgId, userId: reviewerId },
          draft.id,
          `race-invoice-approve-${randomUUID()}`,
        );
        await invoices.issue(
          actor,
          draft.id,
          `race-invoice-issue-${randomUUID()}`,
        );
        await tx.financeReceipt.createMany({
          data: receiptIds.map((id) => ({
            id,
            financeProfileId: profile.id,
            payerAccountId: payer.id,
            tenantId,
            orgId,
            amountMinor: 300n,
            source: "MANUAL_TRANSFER",
            status: "CONFIRMED" as const,
            confirmedAt: new Date(),
          })),
        });
        for (const [checkoutAttemptId, checkoutSessionId] of checkoutFixtures) {
          const attempt = await tx.financeCheckoutAttempt.create({
            data: {
              id: checkoutAttemptId,
              financeProfileId: profile.id,
              stripeConnectionId: stripeConnection.id,
              payerGrantId: payerGrant.id,
              invoiceId: draft.id,
              tenantId,
              orgId,
              stripeAccountId,
              livemode: false,
              amountMinor: 200n,
              status: "CREATING",
              idempotencyKey: `race-checkout-${randomUUID()}`,
              integrationIdentifier: `nexsteps-finance-${randomUUID()
                .replaceAll("-", "")
                .slice(0, 8)
                .replace(/[0-9]/g, (digit) =>
                  String.fromCharCode(97 + Number(digit)),
                )}`,
            },
          });
          await tx.financeCheckoutAttempt.update({
            where: { id: attempt.id },
            data: {
              status: "EXPIRED",
              stripeCheckoutSessionId: checkoutSessionId,
              checkoutUrl: `https://checkout.stripe.com/c/pay/${randomUUID()}`,
              expiresAt: new Date(Date.now() - 60_000),
            },
          });
        }
        return {
          profileId: profile.id,
          payerId: payer.id,
          payerGrantId: payerGrant.id,
          stripeConnectionId: stripeConnection.id,
          invoiceId: draft.id,
          previousInvoiceNumber: previousSequence?.lastIssuedNumber ?? null,
          createdProfile,
        };
      });

      const preparedFixture = fixture;
      if (!preparedFixture)
        throw new Error("Finance race fixture was not created");

      const attempts = await Promise.allSettled([
        receipts.allocate(actor, receiptIds[0], idempotencyKeys[0], {
          invoiceId: preparedFixture.invoiceId,
          amountMinor: "300",
        }),
        receipts.allocate(actor, receiptIds[1], idempotencyKeys[1], {
          invoiceId: preparedFixture.invoiceId,
          amountMinor: "300",
        }),
      ]);
      const fulfilled = attempts.filter(
        (attempt) => attempt.status === "fulfilled",
      );
      const rejected = attempts.filter(
        (attempt) => attempt.status === "rejected",
      );
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      if (rejected[0]?.status === "rejected") {
        expect(rejected[0].reason).toBeInstanceOf(ConflictException);
      }
      expect(
        (await invoices.get(actor, preparedFixture.invoiceId)).balance,
      ).toEqual({
        issuedGrossMinor: "500",
        issuedCreditsMinor: "0",
        allocatedReceiptsMinor: "300",
        outstandingMinor: "200",
        creditBalanceMinor: "0",
      });

      const stripeEvents = checkoutFixtures.map(([attemptId, sessionId]) => {
        const eventId = `evt_race_${randomUUID()}`;
        return {
          stripeEventId: eventId,
          tenantId,
          orgId,
          stripeAccountId,
          eventType: "checkout.session.async_payment_succeeded",
          livemode: false,
          payloadJson: {
            id: eventId,
            type: "checkout.session.async_payment_succeeded",
            created: Math.floor(Date.now() / 1_000),
            livemode: false,
            account: stripeAccountId,
            data: {
              object: {
                id: sessionId,
                object: "checkout.session",
                client_reference_id: attemptId,
                amount_total: 200,
                currency: "gbp",
                payment_intent: `pi_${randomUUID().replaceAll("-", "")}`,
                payment_status: "paid",
                status: "complete",
                metadata: {
                  finance_checkout_attempt_id: attemptId,
                  finance_invoice_id: preparedFixture.invoiceId,
                },
              },
            },
          },
        };
      });
      const paymentResults = await Promise.all(
        stripeEvents.map((event) => paymentWebhooks.process(event)),
      );
      expect(paymentResults).toEqual(["processed", "processed"]);

      const stripeReceipts = await withTenantRlsContext(tenantId, orgId, (tx) =>
        tx.financeReceipt.findMany({
          where: {
            tenantId,
            orgId,
            source: "STRIPE_CARD",
            sourceReference: { in: [...checkoutSessionIds] },
          },
          select: {
            id: true,
            amountMinor: true,
            status: true,
            allocations: { select: { amountMinor: true } },
          },
        }),
      );
      expect(stripeReceipts).toHaveLength(2);
      expect(
        stripeReceipts.every((receipt) => receipt.status === "CONFIRMED"),
      ).toBe(true);
      const stripeAllocationMinor = stripeReceipts.reduce(
        (sum, receipt) =>
          sum +
          receipt.allocations.reduce(
            (allocationSum, allocation) =>
              allocationSum + allocation.amountMinor,
            0n,
          ),
        0n,
      );
      const stripeUnappliedMinor = stripeReceipts.reduce(
        (sum, receipt) =>
          sum +
          receipt.amountMinor -
          receipt.allocations.reduce(
            (allocationSum, allocation) =>
              allocationSum + allocation.amountMinor,
            0n,
          ),
        0n,
      );
      expect(stripeAllocationMinor).toBe(200n);
      expect(stripeUnappliedMinor).toBe(200n);
      expect(
        (await invoices.get(actor, preparedFixture.invoiceId)).balance,
      ).toEqual({
        issuedGrossMinor: "500",
        issuedCreditsMinor: "0",
        allocatedReceiptsMinor: "500",
        outstandingMinor: "0",
        creditBalanceMinor: "0",
      });
      const paidAttempts = await withTenantRlsContext(tenantId, orgId, (tx) =>
        tx.financeCheckoutAttempt.count({
          where: {
            id: { in: [...checkoutAttemptIds] },
            tenantId,
            orgId,
            status: "PAID",
          },
        }),
      );
      expect(paidAttempts).toBe(2);
    } finally {
      const cleanupFixture = fixture;
      if (cleanupFixture) {
        await withTenantRlsContext(tenantId, orgId, async (tx) => {
          // These test-only rows are disposable; restore every guard before commit.
          await tx.$executeRawUnsafe(
            'ALTER TABLE "FinanceReceiptAllocation" DISABLE TRIGGER "FinanceReceiptAllocation_append_only"',
          );
          await tx.$executeRawUnsafe(
            'ALTER TABLE "FinanceInvoice" DISABLE TRIGGER "FinanceInvoice_protect_issued_snapshot"',
          );
          await tx.$executeRawUnsafe(
            'ALTER TABLE "FinanceInvoiceLine" DISABLE TRIGGER "FinanceInvoiceLine_require_draft"',
          );
          await tx.$executeRawUnsafe(
            'ALTER TABLE "FinanceInvoiceEvent" DISABLE TRIGGER "FinanceInvoiceEvent_append_only"',
          );
          await tx.$executeRawUnsafe(
            'ALTER TABLE "FinanceCommandReceipt" DISABLE TRIGGER "FinanceCommandReceipt_append_only"',
          );
          await tx.$executeRawUnsafe(
            'ALTER TABLE "FinanceReceipt" DISABLE TRIGGER "FinanceReceipt_evidence_guard"',
          );
          await tx.$executeRawUnsafe(
            'ALTER TABLE "FinanceCheckoutAttempt" DISABLE TRIGGER "FinanceCheckoutAttempt_evidence_guard"',
          );
          await tx.$executeRawUnsafe(
            'ALTER TABLE "FinanceStripeConnection" DISABLE TRIGGER "FinanceStripeConnection_evidence_guard"',
          );
          await tx.financeCommandReceipt.deleteMany({
            where: {
              tenantId,
              orgId,
              actorUserId: { in: [creatorId, reviewerId] },
            },
          });
          await tx.financeReceiptAllocation.deleteMany({
            where: { invoiceId: cleanupFixture.invoiceId, tenantId, orgId },
          });
          await tx.financeInvoiceEvent.deleteMany({
            where: { invoiceId: cleanupFixture.invoiceId, tenantId, orgId },
          });
          await tx.financeInvoiceLine.deleteMany({
            where: { invoiceId: cleanupFixture.invoiceId, tenantId, orgId },
          });
          await tx.financeCheckoutAttempt.deleteMany({
            where: { id: { in: [...checkoutAttemptIds] }, tenantId, orgId },
          });
          await tx.financeInvoice.delete({
            where: { id: cleanupFixture.invoiceId },
          });
          await tx.financeReceipt.deleteMany({
            where: { id: { in: [...receiptIds] }, tenantId, orgId },
          });
          await tx.financeReceipt.deleteMany({
            where: {
              tenantId,
              orgId,
              source: "STRIPE_CARD",
              sourceReference: { in: [...checkoutSessionIds] },
            },
          });
          if (cleanupFixture.previousInvoiceNumber === null) {
            await tx.financeInvoiceNumberSequence.deleteMany({
              where: {
                tenantId,
                orgId,
                financeProfileId: cleanupFixture.profileId,
              },
            });
          } else {
            await tx.financeInvoiceNumberSequence.update({
              where: {
                financeProfileId_tenantId_orgId: {
                  financeProfileId: cleanupFixture.profileId,
                  tenantId,
                  orgId,
                },
              },
              data: { lastIssuedNumber: cleanupFixture.previousInvoiceNumber },
            });
          }
          await tx.financePayerGrant.delete({
            where: { id: cleanupFixture.payerGrantId },
          });
          await tx.financePayerAccount.delete({
            where: { id: cleanupFixture.payerId },
          });
          await tx.financeStripeConnection.delete({
            where: { id: cleanupFixture.stripeConnectionId },
          });
          if (cleanupFixture.createdProfile) {
            await tx.financeProfile.delete({
              where: { id: cleanupFixture.profileId },
            });
          }
          await tx.user.deleteMany({
            where: { id: { in: [creatorId, reviewerId, payerUserId] } },
          });
          await tx.$executeRawUnsafe(
            'ALTER TABLE "FinanceInvoiceEvent" ENABLE TRIGGER "FinanceInvoiceEvent_append_only"',
          );
          await tx.$executeRawUnsafe(
            'ALTER TABLE "FinanceInvoiceLine" ENABLE TRIGGER "FinanceInvoiceLine_require_draft"',
          );
          await tx.$executeRawUnsafe(
            'ALTER TABLE "FinanceInvoice" ENABLE TRIGGER "FinanceInvoice_protect_issued_snapshot"',
          );
          await tx.$executeRawUnsafe(
            'ALTER TABLE "FinanceReceiptAllocation" ENABLE TRIGGER "FinanceReceiptAllocation_append_only"',
          );
          await tx.$executeRawUnsafe(
            'ALTER TABLE "FinanceCommandReceipt" ENABLE TRIGGER "FinanceCommandReceipt_append_only"',
          );
          await tx.$executeRawUnsafe(
            'ALTER TABLE "FinanceReceipt" ENABLE TRIGGER "FinanceReceipt_evidence_guard"',
          );
          await tx.$executeRawUnsafe(
            'ALTER TABLE "FinanceCheckoutAttempt" ENABLE TRIGGER "FinanceCheckoutAttempt_evidence_guard"',
          );
          await tx.$executeRawUnsafe(
            'ALTER TABLE "FinanceStripeConnection" ENABLE TRIGGER "FinanceStripeConnection_evidence_guard"',
          );
        });
      }
    }
  });
});
