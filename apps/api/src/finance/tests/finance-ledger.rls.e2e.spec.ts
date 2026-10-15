import { randomUUID } from "node:crypto";
import { Prisma, prisma, withTenantRlsContext } from "@pathway/db";
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
  "FinanceInvoice",
  "FinanceInvoiceLine",
  "FinanceReceipt",
  "FinanceReceiptAllocation",
  "FinancePayerAccount",
  "FinancePayerGrant",
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
