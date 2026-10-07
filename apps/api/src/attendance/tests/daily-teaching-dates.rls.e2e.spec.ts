import { randomUUID } from "node:crypto";
import { Prisma, prisma, withTenantRlsContext } from "@pathway/db";
import { requireDatabase } from "../../../test-helpers.e2e";

const orgId = process.env.E2E_ORG_ID;
const siteId = process.env.E2E_TENANT_ID;
const otherSiteId = process.env.E2E_TENANT2_ID;

if (!orgId || !siteId || !otherSiteId) {
  throw new Error("Teaching-date RLS test requires seeded E2E sites");
}

async function createYear(tx: Prisma.TransactionClient, tenantId: string) {
  const id = randomUUID();
  await tx.academicYear.create({
    data: {
      id,
      tenantId,
      name: `Teaching ${id}`,
      startsOn: new Date("2026-09-01T00:00:00.000Z"),
      endsOn: new Date("2027-08-31T00:00:00.000Z"),
      status: "ARCHIVED",
    },
  });
  return id;
}

describe("ACE daily teaching-date foundation", () => {
  it("forces site RLS and makes unconfigured dates absent", async () => {
    if (!requireDatabase()) return;
    if (process.env.E2E_TENANT_RLS_ROLE !== "pathway_e2e_tenant_rls") {
      throw new Error("Teaching-date test requires the tenant RLS role");
    }

    const flags = await prisma.$queryRaw<
      Array<{ enabled: boolean; forced: boolean }>
    >`
      SELECT c.relrowsecurity AS "enabled", c.relforcerowsecurity AS "forced"
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relname = 'AceTeachingDate'
    `;
    expect(flags).toEqual([{ enabled: true, forced: true }]);

    await withTenantRlsContext(siteId, orgId, async (tx) => {
      const academicYearId = await createYear(tx, siteId);
      const teachingDate = await tx.aceTeachingDate.create({
        data: {
          tenantId: siteId,
          academicYearId,
          date: new Date("2026-09-01T00:00:00.000Z"),
          kind: "TEACHING",
        },
      });

      await tx.$executeRawUnsafe('SET LOCAL ROLE "pathway_e2e_tenant_rls"');
      expect(
        await tx.aceTeachingDate.findMany({ where: { id: teachingDate.id } }),
      ).toHaveLength(1);
      expect(
        await tx.aceTeachingDate.findMany({
          where: {
            academicYearId,
            date: new Date("2026-09-02T00:00:00.000Z"),
          },
        }),
      ).toEqual([]);
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${otherSiteId}, true)`;
      expect(
        await tx.aceTeachingDate.findMany({ where: { id: teachingDate.id } }),
      ).toEqual([]);
    });
  });

  it("records holidays and exceptional openings with reasons", async () => {
    if (!requireDatabase()) return;

    await withTenantRlsContext(siteId, orgId, async (tx) => {
      const academicYearId = await createYear(tx, siteId);
      const holiday = await tx.aceTeachingDate.create({
        data: {
          tenantId: siteId,
          academicYearId,
          date: new Date("2026-12-25T00:00:00.000Z"),
          kind: "HOLIDAY",
          reason: "Christmas Day",
        },
      });
      const exceptionalOpening = await tx.aceTeachingDate.create({
        data: {
          tenantId: siteId,
          academicYearId,
          date: new Date("2027-01-02T00:00:00.000Z"),
          kind: "EXCEPTIONAL_OPEN",
          reason: "Saturday teaching session",
        },
      });
      expect([holiday.kind, exceptionalOpening.kind]).toEqual([
        "HOLIDAY",
        "EXCEPTIONAL_OPEN",
      ]);
    });
  });

  it("rejects a closure without a reason and a date outside its year", async () => {
    if (!requireDatabase()) return;

    await expect(
      withTenantRlsContext(siteId, orgId, async (tx) => {
        const academicYearId = await createYear(tx, siteId);
        await tx.$executeRaw`
          INSERT INTO "AceTeachingDate" (
            "id", "tenantId", "academicYearId", "date", "kind", "reason", "updatedAt"
          ) VALUES (
            ${randomUUID()}, ${siteId}, ${academicYearId},
            '2026-12-25', 'CLOSED', '   ', CURRENT_TIMESTAMP
          )
        `;
      }),
    ).rejects.toMatchObject({ code: "P2010", meta: { code: "23514" } });

    await expect(
      withTenantRlsContext(siteId, orgId, async (tx) => {
        const academicYearId = await createYear(tx, siteId);
        await tx.$executeRaw`
          INSERT INTO "AceTeachingDate" (
            "id", "tenantId", "academicYearId", "date", "kind", "updatedAt"
          ) VALUES (
            ${randomUUID()}, ${siteId}, ${academicYearId},
            '2027-09-01', 'TEACHING', CURRENT_TIMESTAMP
          )
        `;
      }),
    ).rejects.toMatchObject({ code: "P2010", meta: { code: "23514" } });
  });
});
