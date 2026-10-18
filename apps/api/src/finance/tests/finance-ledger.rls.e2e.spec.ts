import { randomUUID } from "node:crypto";
import {
  applyTenantContext,
  Prisma,
  prisma,
  withTenantRlsContext,
} from "@pathway/db";
import { requireDatabase } from "../../../test-helpers.e2e";

const tenantRlsRole = "pathway_e2e_tenant_rls";
function requiredFixture(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Finance ledger RLS test requires ${name}`);
  }
  return value;
}

const orgId = requiredFixture("E2E_ORG_ID");
const tenantAId = requiredFixture("E2E_TENANT_ID");
const tenantBId = requiredFixture("E2E_TENANT2_ID");
const financeTables = [
  "FinanceProfile",
  "FinanceInvoiceNumberSequence",
  "FinanceCreditNoteNumberSequence",
  "FinanceInvoice",
  "FinanceInvoiceLine",
  "FinanceInvoiceEvent",
  "FinanceReceipt",
  "FinanceReceiptAllocation",
  "FinanceReceiptAllocationReversal",
  "FinanceBankTransferChange",
  "FinanceManualReceiptRequest",
  "FinanceTransferNotice",
  "FinanceStripeConnection",
  "FinanceStripeWebhookEvent",
  "FinancePayerAccount",
  "FinancePayerGrant",
  "FinanceCreditNote",
  "FinanceCreditNoteLine",
  "FinanceCreditNoteEvent",
  "FinanceCommandReceipt",
] as const;

interface FinanceProfileFixture {
  id: string;
  tenantId: string;
}

async function createProfile(tenantId: string): Promise<FinanceProfileFixture> {
  const id = randomUUID();
  await withTenantRlsContext(tenantId, orgId, (tx) =>
    tx.financeProfile.create({
      data: {
        id,
        tenantId,
        orgId,
        legalEntityName: `Finance test ${id}`,
      },
    }),
  );
  return { id, tenantId };
}

async function removeProfile(profile: FinanceProfileFixture): Promise<void> {
  await withTenantRlsContext(profile.tenantId, orgId, async (tx) => {
    const payerAccounts = await tx.financePayerAccount.findMany({
      where: { financeProfileId: profile.id },
      select: { id: true },
    });
    await tx.financePayerGrant.deleteMany({
      where: {
        financePayerAccountId: { in: payerAccounts.map(({ id }) => id) },
      },
    });
    await tx.financePayerAccount.deleteMany({
      where: { financeProfileId: profile.id },
    });
    await tx.financeInvoiceNumberSequence.deleteMany({
      where: { financeProfileId: profile.id },
    });
    await tx.financeProfile.delete({ where: { id: profile.id } });
  });
}

async function createPayerAccount(
  profile: FinanceProfileFixture,
  displayName: string,
): Promise<string> {
  const id = randomUUID();
  await withTenantRlsContext(profile.tenantId, orgId, (tx) =>
    tx.financePayerAccount.create({
      data: {
        id,
        financeProfileId: profile.id,
        tenantId: profile.tenantId,
        orgId,
        displayName,
      },
    }),
  );
  return id;
}

async function expectCheckViolation(operation: () => Promise<unknown>) {
  await expect(operation()).rejects.toMatchObject({
    code: "P2010",
    meta: { code: "23514" },
  });
}

describe("Finance ledger database foundation", () => {
  it("forces tenant and organisation RLS on every ledger table", async () => {
    if (!requireDatabase()) return;

    const rows = await prisma.$queryRaw<
      Array<{ name: string; enabled: boolean; forced: boolean }>
    >`
      SELECT c.relname AS "name", c.relrowsecurity AS "enabled",
             c.relforcerowsecurity AS "forced"
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app'
        AND c.relname IN (${Prisma.join(financeTables)})
      ORDER BY c.relname
    `;
    expect(rows).toEqual(
      [...financeTables].sort().map((name) => ({
        name,
        enabled: true,
        forced: true,
      })),
    );
  });

  it("hides other-tenant profiles and rejects forged scope under a low-privilege role", async () => {
    if (!requireDatabase()) return;
    if (process.env.E2E_TENANT_RLS_ROLE !== tenantRlsRole) {
      throw new Error("Finance ledger test requires the tenant RLS role");
    }

    const profileA = await createProfile(tenantAId);
    const profileB = await createProfile(tenantBId);
    try {
      await withTenantRlsContext(tenantAId, orgId, async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE "${tenantRlsRole}"`);
        const visible = await tx.financeProfile.findMany({
          where: { id: { in: [profileA.id, profileB.id] } },
          select: { id: true },
        });
        expect(visible.map(({ id }) => id)).toEqual([profileA.id]);

        await expect(
          tx.$executeRaw`
            INSERT INTO "FinanceProfile" (
              "id", "tenantId", "orgId", "legalEntityName", "updatedAt"
            ) VALUES (
              ${randomUUID()}, ${tenantBId}, ${orgId}, 'Forged tenant', CURRENT_TIMESTAMP
            )
          `,
        ).rejects.toMatchObject({ code: "P2010", meta: { code: "42501" } });
      });

      await withTenantRlsContext(tenantBId, orgId, async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE "${tenantRlsRole}"`);
        await expect(
          tx.$executeRaw`
            INSERT INTO "FinanceInvoiceNumberSequence" (
              "financeProfileId", "tenantId", "orgId", "updatedAt"
            ) VALUES (
              ${profileA.id}, ${tenantBId}, ${orgId}, CURRENT_TIMESTAMP
            )
          `,
        ).rejects.toMatchObject({ code: "P2010", meta: { code: "23503" } });
      });
    } finally {
      await removeProfile(profileB);
      await removeProfile(profileA);
    }
  });

  it("isolates Stripe collection accounts by tenant under the RLS role", async () => {
    if (!requireDatabase()) return;
    if (process.env.E2E_TENANT_RLS_ROLE !== tenantRlsRole) {
      throw new Error("Finance ledger test requires the tenant RLS role");
    }

    const userId = randomUUID();
    const profileAId = randomUUID();
    const profileBId = randomUUID();
    const connectionAId = randomUUID();
    const connectionBId = randomUUID();
    const stripeAccountAId = `acct_${randomUUID().replaceAll("-", "")}`;
    const stripeAccountBId = `acct_${randomUUID().replaceAll("-", "")}`;
    const eventAId = `evt_${randomUUID().replaceAll("-", "")}`;
    const eventBId = `evt_${randomUUID().replaceAll("-", "")}`;
    const unmatchedEventId = `evt_${randomUUID().replaceAll("-", "")}`;
    const payloadSha256 = "a".repeat(64);
    const rollbackFixture = new Error("rollback Finance Stripe RLS fixture");

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.user.create({
          data: {
            id: userId,
            email: `finance-connect-${userId}@example.test`,
          },
        });

        await applyTenantContext(tx, tenantAId, orgId);
        await tx.financeProfile.create({
          data: {
            id: profileAId,
            tenantId: tenantAId,
            orgId,
            legalEntityName: "Finance Stripe test A",
          },
        });
        await tx.financeStripeConnection.create({
          data: {
            id: connectionAId,
            financeProfileId: profileAId,
            tenantId: tenantAId,
            orgId,
            requestedByUserId: userId,
            stripeAccountId: stripeAccountAId,
          },
        });

        await applyTenantContext(tx, tenantBId, orgId);
        await tx.financeProfile.create({
          data: {
            id: profileBId,
            tenantId: tenantBId,
            orgId,
            legalEntityName: "Finance Stripe test B",
          },
        });
        await tx.financeStripeConnection.create({
          data: {
            id: connectionBId,
            financeProfileId: profileBId,
            tenantId: tenantBId,
            orgId,
            requestedByUserId: userId,
            stripeAccountId: stripeAccountBId,
          },
        });

        const captureA = await tx.$queryRaw<{ result: string }[]>`
          SELECT app.capture_finance_stripe_webhook_event(
            ${eventAId}, ${stripeAccountAId}, 'account.updated', false,
            ${payloadSha256}, ${JSON.stringify({ id: eventAId })}::jsonb
          ) AS result
        `;
        const captureDuplicate = await tx.$queryRaw<{ result: string }[]>`
          SELECT app.capture_finance_stripe_webhook_event(
            ${eventAId}, ${stripeAccountAId}, 'account.updated', false,
            ${payloadSha256}, ${JSON.stringify({ id: eventAId })}::jsonb
          ) AS result
        `;
        const captureB = await tx.$queryRaw<{ result: string }[]>`
          SELECT app.capture_finance_stripe_webhook_event(
            ${eventBId}, ${stripeAccountBId}, 'payment_intent.succeeded', false,
            ${payloadSha256}, ${JSON.stringify({ id: eventBId })}::jsonb
          ) AS result
        `;
        const captureUnmatched = await tx.$queryRaw<{ result: string }[]>`
          SELECT app.capture_finance_stripe_webhook_event(
            ${unmatchedEventId}, 'acct_unmapped_finance_test', 'payment_intent.succeeded', false,
            ${payloadSha256}, ${JSON.stringify({ id: unmatchedEventId })}::jsonb
          ) AS result
        `;
        expect(captureA[0]?.result).toBe("accepted");
        expect(captureDuplicate[0]?.result).toBe("duplicate");
        expect(captureB[0]?.result).toBe("accepted");
        expect(captureUnmatched[0]?.result).toBe("unmatched");
        const dueScopes = await tx.$queryRaw<
          { tenantId: string; orgId: string }[]
        >`
          SELECT "tenantId", "orgId"
          FROM app.list_due_finance_stripe_webhook_scopes(CURRENT_TIMESTAMP)
        `;
        expect(dueScopes).toEqual(
          [
            { tenantId: tenantAId, orgId },
            { tenantId: tenantBId, orgId },
          ].sort((left, right) => left.tenantId.localeCompare(right.tenantId)),
        );

        await applyTenantContext(tx, tenantAId, orgId);
        await tx.$executeRawUnsafe(`SET LOCAL ROLE "${tenantRlsRole}"`);
        const visible = await tx.financeStripeConnection.findMany({
          where: { id: { in: [connectionAId, connectionBId] } },
          select: { id: true },
        });
        expect(visible.map(({ id }) => id)).toEqual([connectionAId]);
        const visibleWebhookEvents =
          await tx.financeStripeWebhookEvent.findMany({
            where: {
              stripeEventId: { in: [eventAId, eventBId, unmatchedEventId] },
            },
            select: { stripeEventId: true },
          });
        expect(
          visibleWebhookEvents.map(({ stripeEventId }) => stripeEventId),
        ).toEqual([eventAId]);

        await expect(
          tx.$executeRaw`
            INSERT INTO "FinanceStripeConnection" (
              "id", "financeProfileId", "tenantId", "orgId",
              "requestedByUserId", "updatedAt"
            ) VALUES (
              ${randomUUID()}, ${profileBId}, ${tenantBId}, ${orgId},
              ${userId}, CURRENT_TIMESTAMP
            )
          `,
        ).rejects.toMatchObject({ code: "P2010", meta: { code: "42501" } });
        throw rollbackFixture;
      }),
    ).rejects.toBe(rollbackFixture);
  });

  it("rejects direct cross-tenant Finance webhook event inserts under the RLS role", async () => {
    if (!requireDatabase()) return;
    if (process.env.E2E_TENANT_RLS_ROLE !== tenantRlsRole) {
      throw new Error("Finance webhook test requires the tenant RLS role");
    }

    await expect(
      withTenantRlsContext(tenantAId, orgId, async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE "${tenantRlsRole}"`);
        await tx.$executeRaw`
          INSERT INTO "FinanceStripeWebhookEvent" (
            "id", "stripeEventId", "stripeAccountId", "eventType", "livemode",
            "payloadSha256", "payloadJson", "status", "tenantId", "orgId"
          ) VALUES (
            ${randomUUID()}, ${`evt_${randomUUID().replaceAll("-", "")}`},
            'acct_finance_scope_forgery', 'account.updated', false,
            ${"a".repeat(64)}, '{}'::jsonb, 'RECEIVED', ${tenantBId}, ${orgId}
          )
        `;
      }),
    ).rejects.toMatchObject({ code: "P2010", meta: { code: "42501" } });
  });

  it("isolates payer grants by tenant and rejects forged account scope", async () => {
    if (!requireDatabase()) return;
    if (process.env.E2E_TENANT_RLS_ROLE !== tenantRlsRole) {
      throw new Error("Finance payer grant test requires the tenant RLS role");
    }

    const payerUserId = randomUUID();
    const grantAId = randomUUID();
    const grantBId = randomUUID();
    let profileA: FinanceProfileFixture | null = null;
    let profileB: FinanceProfileFixture | null = null;

    try {
      profileA = await createProfile(tenantAId);
      profileB = await createProfile(tenantBId);
      const accountAId = await createPayerAccount(profileA, "Payer A");
      const accountBId = await createPayerAccount(profileB, "Payer B");
      await prisma.user.create({
        data: {
          id: payerUserId,
          email: `finance-payer-${payerUserId}@example.test`,
        },
      });

      await withTenantRlsContext(tenantAId, orgId, (tx) =>
        tx.financePayerGrant.create({
          data: {
            id: grantAId,
            financePayerAccountId: accountAId,
            tenantId: tenantAId,
            orgId,
            payerUserId,
            grantedByUserId: payerUserId,
          },
        }),
      );
      await withTenantRlsContext(tenantBId, orgId, (tx) =>
        tx.financePayerGrant.create({
          data: {
            id: grantBId,
            financePayerAccountId: accountBId,
            tenantId: tenantBId,
            orgId,
            payerUserId,
            grantedByUserId: payerUserId,
          },
        }),
      );

      await expect(
        withTenantRlsContext(tenantAId, orgId, (tx) =>
          tx.financePayerGrant.create({
            data: {
              id: randomUUID(),
              financePayerAccountId: accountAId,
              tenantId: tenantAId,
              orgId,
              payerUserId,
              grantedByUserId: payerUserId,
            },
          }),
        ),
      ).rejects.toMatchObject({ code: "P2002" });

      await withTenantRlsContext(tenantAId, orgId, async (tx) => {
        await tx.financePayerGrant.update({
          where: { id: grantAId },
          data: { revokedAt: new Date(), revokedByUserId: payerUserId },
        });
        await tx.financePayerGrant.create({
          data: {
            financePayerAccountId: accountAId,
            tenantId: tenantAId,
            orgId,
            payerUserId,
            grantedByUserId: payerUserId,
          },
        });
      });

      await withTenantRlsContext(tenantAId, orgId, async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE "${tenantRlsRole}"`);
        const visible = await tx.financePayerGrant.findMany({
          where: { id: { in: [grantAId, grantBId] } },
          select: { id: true },
        });
        expect(visible.map(({ id }) => id)).toEqual([grantAId]);

        await expect(
          tx.$executeRaw`
            INSERT INTO "FinancePayerGrant" (
              "id", "financePayerAccountId", "tenantId", "orgId",
              "payerUserId", "grantedByUserId"
            ) VALUES (
              ${randomUUID()}, ${accountBId}, ${tenantBId}, ${orgId},
              ${payerUserId}, ${payerUserId}
            )
          `,
        ).rejects.toMatchObject({ code: "P2010", meta: { code: "42501" } });
      });
    } finally {
      try {
        if (profileB) await removeProfile(profileB);
        if (profileA) await removeProfile(profileA);
      } finally {
        await prisma.user.deleteMany({ where: { id: payerUserId } });
      }
    }
  });

  it("rejects inconsistent invoice totals and receipt states", async () => {
    if (!requireDatabase()) return;

    const profile = await createProfile(tenantAId);
    try {
      await expectCheckViolation(() =>
        withTenantRlsContext(
          tenantAId,
          orgId,
          (tx) =>
            tx.$executeRaw`
            INSERT INTO "FinanceInvoice" (
              "id", "financeProfileId", "tenantId", "orgId",
              "subtotalMinor", "taxMinor", "totalMinor", "updatedAt"
            ) VALUES (
              ${randomUUID()}, ${profile.id}, ${tenantAId}, ${orgId},
              100, 20, 119, CURRENT_TIMESTAMP
            )
          `,
        ),
      );

      await expectCheckViolation(() =>
        withTenantRlsContext(
          tenantAId,
          orgId,
          (tx) =>
            tx.$executeRaw`
            INSERT INTO "FinanceInvoice" (
              "id", "financeProfileId", "tenantId", "orgId", "status",
              "subtotalMinor", "taxMinor", "totalMinor", "updatedAt"
            ) VALUES (
              ${randomUUID()}, ${profile.id}, ${tenantAId}, ${orgId}, 'ISSUED',
              100, 20, 120, CURRENT_TIMESTAMP
            )
          `,
        ),
      );

      await expectCheckViolation(() =>
        withTenantRlsContext(
          tenantAId,
          orgId,
          (tx) =>
            tx.$executeRaw`
            INSERT INTO "FinanceReceipt" (
              "id", "financeProfileId", "tenantId", "orgId", "amountMinor",
              "source", "updatedAt"
            ) VALUES (
              ${randomUUID()}, ${profile.id}, ${tenantAId}, ${orgId}, 0,
              'MANUAL_TRANSFER', CURRENT_TIMESTAMP
            )
          `,
        ),
      );

      await expectCheckViolation(() =>
        withTenantRlsContext(
          tenantAId,
          orgId,
          (tx) =>
            tx.$executeRaw`
            INSERT INTO "FinanceReceipt" (
              "id", "financeProfileId", "tenantId", "orgId", "amountMinor",
              "source", "status", "updatedAt"
            ) VALUES (
              ${randomUUID()}, ${profile.id}, ${tenantAId}, ${orgId}, 100,
              'MANUAL_TRANSFER', 'CONFIRMED', CURRENT_TIMESTAMP
            )
          `,
        ),
      );
    } finally {
      await removeProfile(profile);
    }
  });

  it("keeps an issued invoice snapshot immutable, including after voiding", async () => {
    if (!requireDatabase()) return;

    const invoiceId = randomUUID();
    const creatorId = randomUUID();
    const approverId = randomUUID();
    const invoiceNumber = BigInt(
      `0x${randomUUID().replaceAll("-", "").slice(0, 12)}`,
    );
    const issuedAt = new Date();
    const voidedAt = new Date(issuedAt.getTime() + 1_000);
    const rollbackFixture = new Error("rollback Finance snapshot fixture");

    await expect(
      withTenantRlsContext(tenantAId, orgId, async (tx) => {
        await tx.user.createMany({
          data: [
            {
              id: creatorId,
              email: `finance-creator-${creatorId}@example.test`,
            },
            {
              id: approverId,
              email: `finance-approver-${approverId}@example.test`,
            },
          ],
        });
        const profile = await tx.financeProfile.create({
          data: {
            id: randomUUID(),
            tenantId: tenantAId,
            orgId,
            legalEntityName: `Finance test ${randomUUID()}`,
          },
        });
        const payerAccount = await tx.financePayerAccount.create({
          data: {
            financeProfileId: profile.id,
            tenantId: tenantAId,
            orgId,
            displayName: "Immutable snapshot payer",
          },
        });
        await tx.financeInvoice.create({
          data: {
            id: invoiceId,
            financeProfileId: profile.id,
            payerAccountId: payerAccount.id,
            tenantId: tenantAId,
            orgId,
            createdByUserId: creatorId,
            subtotalMinor: 100n,
            taxMinor: 20n,
            totalMinor: 120n,
          },
        });
        await tx.financeInvoiceLine.create({
          data: {
            invoiceId,
            tenantId: tenantAId,
            orgId,
            lineOrder: 0,
            description: "Snapshot line",
            quantity: "1.000",
            unitAmountMinor: 100n,
            taxRateBasisPoints: 2000,
            netAmountMinor: 100n,
            taxAmountMinor: 20n,
            totalMinor: 120n,
          },
        });
        await tx.financeInvoice.update({
          where: { id: invoiceId },
          data: { status: "IN_REVIEW" },
        });
        await tx.financeInvoice.update({
          where: { id: invoiceId },
          data: {
            invoiceNumber,
            status: "ISSUED",
            issuedAt,
            approvedAt: issuedAt,
            approvedByUserId: approverId,
            payerNameSnapshot: payerAccount.displayName,
            legalEntityNameSnapshot: profile.legalEntityName,
          },
        });

        await tx.$executeRaw`SAVEPOINT finance_invoice_snapshot_check`;
        await expectCheckViolation(
          () =>
            tx.$executeRaw`
            UPDATE "FinanceInvoice"
            SET "subtotalMinor" = 110, "totalMinor" = 130
            WHERE "id" = ${invoiceId}
          `,
        );
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT finance_invoice_snapshot_check`;

        await tx.$executeRaw`SAVEPOINT finance_invoice_line_snapshot_check`;
        await expectCheckViolation(
          () =>
            tx.$executeRaw`DELETE FROM "FinanceInvoiceLine" WHERE "invoiceId" = ${invoiceId}`,
        );
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT finance_invoice_line_snapshot_check`;

        await tx.financeInvoice.update({
          where: { id: invoiceId },
          data: {
            status: "VOID",
            voidedAt,
            voidedByUserId: approverId,
            voidReason: "Duplicate issue",
          },
        });
        await tx.$executeRaw`SAVEPOINT finance_void_snapshot_check`;
        await expectCheckViolation(
          () =>
            tx.$executeRaw`
            UPDATE "FinanceInvoice"
            SET "dueAt" = CURRENT_TIMESTAMP
            WHERE "id" = ${invoiceId}
          `,
        );
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT finance_void_snapshot_check`;
        await tx.$executeRaw`SAVEPOINT finance_void_line_snapshot_check`;
        await expectCheckViolation(
          () =>
            tx.$executeRaw`DELETE FROM "FinanceInvoiceLine" WHERE "invoiceId" = ${invoiceId}`,
        );
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT finance_void_line_snapshot_check`;
        throw rollbackFixture;
      }),
    ).rejects.toBe(rollbackFixture);
  });

  it("allocates unique consecutive invoice numbers during concurrent issuance", async () => {
    if (!requireDatabase()) return;

    const profile = await createProfile(tenantAId);
    try {
      const allocated = await Promise.all(
        Array.from({ length: 16 }, () =>
          withTenantRlsContext(tenantAId, orgId, async (tx) => {
            if (process.env.E2E_TENANT_RLS_ROLE === tenantRlsRole) {
              await tx.$executeRawUnsafe(`SET LOCAL ROLE "${tenantRlsRole}"`);
            }

            const rows = await tx.$queryRaw<Array<{ number: bigint }>>`
              INSERT INTO "FinanceInvoiceNumberSequence" (
                "financeProfileId", "tenantId", "orgId", "lastIssuedNumber", "updatedAt"
              ) VALUES (${profile.id}, ${tenantAId}, ${orgId}, 1, CURRENT_TIMESTAMP)
              ON CONFLICT ("financeProfileId", "tenantId", "orgId")
              DO UPDATE SET
                "lastIssuedNumber" = "FinanceInvoiceNumberSequence"."lastIssuedNumber" + 1,
                "updatedAt" = CURRENT_TIMESTAMP
              RETURNING "lastIssuedNumber" AS "number"
            `;
            if (rows.length !== 1) {
              throw new Error("Finance invoice number was not allocated");
            }
            return rows[0].number;
          }),
        ),
      );

      expect(
        allocated.sort((left, right) =>
          left < right ? -1 : left > right ? 1 : 0,
        ),
      ).toEqual(Array.from({ length: 16 }, (_, index) => BigInt(index + 1)));
    } finally {
      await removeProfile(profile);
    }
  });
});
