import { randomUUID } from "node:crypto";
import { applyTenantContext, prisma, type Prisma } from "@pathway/db";
import { requireDatabase } from "../../../../test-helpers.e2e";

async function withRefund(
  check: (tx: Prisma.TransactionClient, id: string) => Promise<void>,
  approved = true,
): Promise<void> {
  const orgId = process.env.E2E_ORG_ID;
  if (!orgId) throw new Error("Missing refund retry fixture organisation");
  const rollback = new Error("Rollback refund retry fixture");
  try {
    await prisma.$transaction(async (tx) => {
      const tenantId = randomUUID();
      await tx.tenant.create({
        data: {
          id: tenantId,
          orgId,
          name: "Refund retry test",
          slug: tenantId,
        },
      });
      await applyTenantContext(tx, tenantId, orgId);
      const requester = await tx.user.create({
        data: { email: `${randomUUID()}@example.test` },
      });
      const approver = await tx.user.create({
        data: { email: `${randomUUID()}@example.test` },
      });
      const profile = await tx.financeProfile.create({
        data: { tenantId, orgId, legalEntityName: "Refund retry test" },
      });
      const payer = await tx.financePayerAccount.create({
        data: {
          tenantId,
          orgId,
          financeProfileId: profile.id,
          displayName: "Synthetic payer",
        },
      });
      const receipt = await tx.financeReceipt.create({
        data: {
          tenantId,
          orgId,
          financeProfileId: profile.id,
          payerAccountId: payer.id,
          amountMinor: 1000n,
          source: "STRIPE_CARD",
          sourceReference: `cs_${randomUUID()}`,
          status: "CONFIRMED",
          confirmedAt: new Date(),
        },
      });
      const refund = await tx.financeRefund.create({
        data: {
          tenantId,
          orgId,
          financeProfileId: profile.id,
          receiptId: receipt.id,
          requestedByUserId: requester.id,
          source: "STRIPE_CARD",
          amountMinor: 500n,
          currency: "GBP",
          reason: "Synthetic refund",
          stripeAccountId: "acct_refund_fixture",
          status: approved ? "APPROVED" : "PENDING",
          approvedAt: approved ? new Date() : null,
          approvedByUserId: approved ? approver.id : null,
          decisionReason: approved ? "Independently approved" : null,
        },
      });
      await check(tx, refund.id);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

describe("durable Finance refund retry window", () => {
  beforeAll(() => {
    if (!requireDatabase())
      throw new Error(
        "Refund retry tests require a working disposable database",
      );
  });

  it("persists the retry-window start independently of provider confirmation", async () => {
    await withRefund(async (tx, id) => {
      const startedAt = new Date();
      await tx.$executeRaw`UPDATE "FinanceRefund" SET "providerAttemptStartedAt" = ${startedAt} WHERE "id" = ${id}`;
      const rows = await tx.$queryRaw<
        Array<{
          providerAttemptStartedAt: Date;
          submittedAt: Date | null;
          status: string;
        }>
      >`SELECT "providerAttemptStartedAt", "submittedAt", "status" FROM "FinanceRefund" WHERE "id" = ${id}`;
      expect(rows).toEqual([
        {
          providerAttemptStartedAt: startedAt,
          submittedAt: null,
          status: "APPROVED",
        },
      ]);
    });
  });

  it.each(["clear", "replace"])(
    "rejects attempts to %s the first-attempt timestamp",
    async (operation) => {
      await expect(
        withRefund(async (tx, id) => {
          await tx.$executeRaw`UPDATE "FinanceRefund" SET "providerAttemptStartedAt" = CURRENT_TIMESTAMP WHERE "id" = ${id}`;
          const replacement =
            operation === "clear" ? null : new Date(Date.now() + 60_000);
          await tx.$executeRaw`UPDATE "FinanceRefund" SET "providerAttemptStartedAt" = ${replacement} WHERE "id" = ${id}`;
        }),
      ).rejects.toMatchObject({ code: "P2010", meta: { code: "23514" } });
    },
  );

  it("rejects starting a provider operation before independent approval", async () => {
    await expect(
      withRefund(async (tx, id) => {
        await tx.$executeRaw`UPDATE "FinanceRefund" SET "providerAttemptStartedAt" = CURRENT_TIMESTAMP WHERE "id" = ${id}`;
      }, false),
    ).rejects.toMatchObject({ code: "P2010", meta: { code: "23514" } });
  });
});
