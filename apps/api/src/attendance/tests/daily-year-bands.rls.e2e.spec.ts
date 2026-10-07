import { randomUUID } from "node:crypto";
import { Prisma, prisma, withTenantRlsContext } from "@pathway/db";
import { requireDatabase } from "../../../test-helpers.e2e";

const TENANT_RLS_ROLE = "pathway_e2e_tenant_rls";
const orgId = process.env.E2E_ORG_ID;
const siteId = process.env.E2E_TENANT_ID;
const otherSiteId = process.env.E2E_TENANT2_ID;

if (!orgId || !siteId || !otherSiteId) {
  throw new Error("Daily year-band RLS test requires seeded E2E sites");
}

const startsOn = new Date("2026-09-01T00:00:00.000Z");

describe("ACE daily register year-band foundation", () => {
  it("forces tenant RLS and withholds public Data API grants", async () => {
    if (!requireDatabase()) return;

    const rows = await prisma.$queryRaw<
      Array<{
        name: string;
        enabled: boolean;
        forced: boolean;
        publicGrant: boolean;
      }>
    >`
      SELECT c.relname AS "name",
             c.relrowsecurity AS "enabled",
             c.relforcerowsecurity AS "forced",
             EXISTS (
               SELECT 1
               FROM pg_catalog.aclexplode(
                 COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))
               ) AS grant_entry
               WHERE grant_entry.grantee = 0
                  OR grant_entry.grantee IN (
                    pg_catalog.to_regrole('anon')::oid,
                    pg_catalog.to_regrole('authenticated')::oid
                  )
             ) AS "publicGrant"
      FROM pg_catalog.pg_class AS c
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app'
        AND c.relname IN ('AceYearBand', 'AceStaffYearBandAssignment')
      ORDER BY c.relname
    `;

    expect(rows).toEqual([
      {
        name: "AceStaffYearBandAssignment",
        enabled: true,
        forced: true,
        publicGrant: false,
      },
      {
        name: "AceYearBand",
        enabled: true,
        forced: true,
        publicGrant: false,
      },
    ]);
  });

  it("keeps band and assignment reads within the selected site", async () => {
    if (!requireDatabase()) return;
    if (process.env.E2E_TENANT_RLS_ROLE !== TENANT_RLS_ROLE) {
      throw new Error("Daily year-band test requires the tenant RLS role");
    }

    const userId = randomUUID();
    const bandId = randomUUID();
    const assignmentId = randomUUID();
    await withTenantRlsContext(
      siteId,
      orgId,
      async (tx: Prisma.TransactionClient) => {
        await tx.user.create({
          data: { id: userId, email: `${userId}@example.test` },
        });
        await tx.siteMembership.create({
          data: { tenantId: siteId, userId },
        });
        await tx.aceYearBand.create({
          data: { id: bandId, tenantId: siteId, name: `Year ${bandId}` },
        });
        await tx.aceStaffYearBandAssignment.create({
          data: {
            id: assignmentId,
            tenantId: siteId,
            yearBandId: bandId,
            userId,
            startsOn,
          },
        });

        await tx.$executeRawUnsafe(`SET LOCAL ROLE "${TENANT_RLS_ROLE}"`);
        expect(
          await tx.aceYearBand.findMany({ where: { id: bandId } }),
        ).toHaveLength(1);
        expect(
          await tx.aceStaffYearBandAssignment.findMany({
            where: { id: assignmentId },
          }),
        ).toHaveLength(1);

        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${otherSiteId}, true)`;
        expect(
          await tx.aceYearBand.findMany({ where: { id: bandId } }),
        ).toEqual([]);
        expect(
          await tx.aceStaffYearBandAssignment.findMany({
            where: { id: assignmentId },
          }),
        ).toEqual([]);
      },
    );
  });

  it("rejects a band from another site and an assignee without staff membership", async () => {
    if (!requireDatabase()) return;

    const foreignBandId = randomUUID();
    await withTenantRlsContext(otherSiteId, orgId, (tx) =>
      tx.aceYearBand.create({
        data: {
          id: foreignBandId,
          tenantId: otherSiteId,
          name: `Foreign ${foreignBandId}`,
        },
      }),
    );

    await expect(
      withTenantRlsContext(siteId, orgId, async (tx) => {
        const userId = randomUUID();
        await tx.user.create({
          data: { id: userId, email: `${userId}@example.test` },
        });
        await tx.siteMembership.create({
          data: { tenantId: siteId, userId },
        });
        await tx.aceStaffYearBandAssignment.create({
          data: {
            tenantId: siteId,
            yearBandId: foreignBandId,
            userId,
            startsOn,
          },
        });
      }),
    ).rejects.toMatchObject({ code: "P2003" });

    await expect(
      withTenantRlsContext(siteId, orgId, async (tx) => {
        const userId = randomUUID();
        const bandId = randomUUID();
        await tx.user.create({
          data: { id: userId, email: `${userId}@example.test` },
        });
        await tx.aceYearBand.create({
          data: { id: bandId, tenantId: siteId, name: `Band ${bandId}` },
        });
        await tx.aceStaffYearBandAssignment.create({
          data: { tenantId: siteId, yearBandId: bandId, userId, startsOn },
        });
      }),
    ).rejects.toMatchObject({ code: "P2003" });

    await expect(
      withTenantRlsContext(siteId, orgId, async (tx) => {
        const userId = randomUUID();
        const bandId = randomUUID();
        await tx.user.create({
          data: { id: userId, email: `${userId}@example.test` },
        });
        await tx.siteMembership.create({
          data: { tenantId: siteId, userId, role: "VIEWER" },
        });
        await tx.aceYearBand.create({
          data: { id: bandId, tenantId: siteId, name: `Band ${bandId}` },
        });
        await tx.aceStaffYearBandAssignment.create({
          data: { tenantId: siteId, yearBandId: bandId, userId, startsOn },
        });
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("rejects an assignment that ends before it starts", async () => {
    if (!requireDatabase()) return;

    await expect(
      withTenantRlsContext(siteId, orgId, async (tx) => {
        const userId = randomUUID();
        const bandId = randomUUID();
        await tx.user.create({
          data: { id: userId, email: `${userId}@example.test` },
        });
        await tx.siteMembership.create({
          data: { tenantId: siteId, userId },
        });
        await tx.aceYearBand.create({
          data: { id: bandId, tenantId: siteId, name: `Band ${bandId}` },
        });
        await tx.$executeRaw`
          INSERT INTO "AceStaffYearBandAssignment" (
            "id", "tenantId", "yearBandId", "userId", "startsOn", "endsOn", "updatedAt"
          ) VALUES (
            ${randomUUID()}, ${siteId}, ${bandId}, ${userId},
            '2026-09-02', '2026-09-01', CURRENT_TIMESTAMP
          )
        `;
      }),
    ).rejects.toMatchObject({ code: "P2010", meta: { code: "23514" } });
  });
});
