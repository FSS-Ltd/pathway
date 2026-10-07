import { randomUUID } from "node:crypto";
import { Prisma, prisma, withTenantRlsContext } from "@pathway/db";
import { requireDatabase } from "../../../test-helpers.e2e";

const orgId = process.env.E2E_ORG_ID;
const siteId = process.env.E2E_TENANT_ID;
const otherSiteId = process.env.E2E_TENANT2_ID;

if (!orgId || !siteId || !otherSiteId) {
  throw new Error("School-enrolment RLS test requires seeded E2E sites");
}

const yearStartsOn = new Date("2026-09-01T00:00:00.000Z");
const yearEndsOn = new Date("2027-08-31T00:00:00.000Z");

async function createScope(
  tx: Prisma.TransactionClient,
  tenantId: string,
  isGuest = false,
) {
  const childId = randomUUID();
  const academicYearId = randomUUID();
  const yearBandId = randomUUID();

  await tx.child.create({
    data: {
      id: childId,
      tenantId,
      firstName: "Daily",
      lastName: "Register",
      isGuest,
    },
  });
  await tx.academicYear.create({
    data: {
      id: academicYearId,
      tenantId,
      name: `Year ${academicYearId}`,
      startsOn: yearStartsOn,
      endsOn: yearEndsOn,
      status: "ARCHIVED",
    },
  });
  await tx.aceYearBand.create({
    data: { id: yearBandId, tenantId, name: `Band ${yearBandId}` },
  });

  return { childId, academicYearId, yearBandId };
}

describe("ACE daily school enrolment foundation", () => {
  it("forces site RLS and keeps roster scope within the selected site", async () => {
    if (!requireDatabase()) return;
    if (process.env.E2E_TENANT_RLS_ROLE !== "pathway_e2e_tenant_rls") {
      throw new Error("School-enrolment test requires the tenant RLS role");
    }

    const rows = await prisma.$queryRaw<
      Array<{ enabled: boolean; forced: boolean }>
    >`
      SELECT c.relrowsecurity AS "enabled", c.relforcerowsecurity AS "forced"
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relname = 'AceSchoolEnrollment'
    `;
    expect(rows).toEqual([{ enabled: true, forced: true }]);

    await withTenantRlsContext(siteId, orgId, async (tx) => {
      const scope = await createScope(tx, siteId);
      const enrollment = await tx.aceSchoolEnrollment.create({
        data: {
          tenantId: siteId,
          ...scope,
          startsOn: yearStartsOn,
        },
      });

      await tx.$executeRawUnsafe('SET LOCAL ROLE "pathway_e2e_tenant_rls"');
      expect(
        await tx.aceSchoolEnrollment.findMany({ where: { id: enrollment.id } }),
      ).toHaveLength(1);
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${otherSiteId}, true)`;
      expect(
        await tx.aceSchoolEnrollment.findMany({ where: { id: enrollment.id } }),
      ).toEqual([]);
    });
  });

  it("rejects guest children and dates outside the academic year", async () => {
    if (!requireDatabase()) return;

    await expect(
      withTenantRlsContext(siteId, orgId, async (tx) => {
        const scope = await createScope(tx, siteId, true);
        await tx.$executeRaw`
          INSERT INTO "AceSchoolEnrollment" (
            "id", "tenantId", "childId", "academicYearId", "yearBandId",
            "startsOn", "updatedAt"
          ) VALUES (
            ${randomUUID()}, ${siteId}, ${scope.childId},
            ${scope.academicYearId}, ${scope.yearBandId},
            '2026-09-01', CURRENT_TIMESTAMP
          )
        `;
      }),
    ).rejects.toMatchObject({ code: "P2010", meta: { code: "23514" } });

    await expect(
      withTenantRlsContext(siteId, orgId, async (tx) => {
        const scope = await createScope(tx, siteId);
        await tx.$executeRaw`
          INSERT INTO "AceSchoolEnrollment" (
            "id", "tenantId", "childId", "academicYearId", "yearBandId",
            "startsOn", "updatedAt"
          ) VALUES (
            ${randomUUID()}, ${siteId}, ${scope.childId},
            ${scope.academicYearId}, ${scope.yearBandId},
            '2027-09-01', CURRENT_TIMESTAMP
          )
        `;
      }),
    ).rejects.toMatchObject({ code: "P2010", meta: { code: "23514" } });
  });

  it("rejects overlapping enrolment dates for one child", async () => {
    if (!requireDatabase()) return;

    await expect(
      withTenantRlsContext(siteId, orgId, async (tx) => {
        const scope = await createScope(tx, siteId);
        await tx.aceSchoolEnrollment.create({
          data: {
            tenantId: siteId,
            ...scope,
            startsOn: yearStartsOn,
            endsOn: new Date("2026-09-30T00:00:00.000Z"),
          },
        });
        await tx.$executeRaw`
          INSERT INTO "AceSchoolEnrollment" (
            "id", "tenantId", "childId", "academicYearId", "yearBandId",
            "startsOn", "updatedAt"
          ) VALUES (
            ${randomUUID()}, ${siteId}, ${scope.childId},
            ${scope.academicYearId}, ${scope.yearBandId},
            '2026-09-15', CURRENT_TIMESTAMP
          )
        `;
      }),
    ).rejects.toMatchObject({ code: "P2010", meta: { code: "23P01" } });
  });
});
