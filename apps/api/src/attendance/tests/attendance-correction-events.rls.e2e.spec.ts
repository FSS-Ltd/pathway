import { randomUUID } from "node:crypto";
import { Prisma, prisma, withTenantRlsContext } from "@pathway/db";
import { requireDatabase } from "../../../test-helpers.e2e";

const TENANT_RLS_ROLE = "pathway_e2e_tenant_rls";

const orgId = process.env.E2E_ORG_ID;
const siteId = process.env.E2E_TENANT_ID;
const otherSiteId = process.env.E2E_TENANT2_ID;

if (!orgId || !siteId || !otherSiteId) {
  throw new Error("Attendance correction RLS test requires seeded E2E sites");
}

describe("attendance correction event storage", () => {
  it("forces tenant RLS and withholds public Data API grants", async () => {
    if (!requireDatabase()) return;

    const rows = await prisma.$queryRaw<
      Array<{ enabled: boolean; forced: boolean; publicGrant: boolean }>
    >`
      SELECT c.relrowsecurity AS "enabled",
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
      WHERE n.nspname = 'app' AND c.relname = 'AttendanceCorrectionEvent'
    `;

    expect(rows).toEqual([{ enabled: true, forced: true, publicGrant: false }]);
  });

  it("keeps live corrections site scoped and rejects forged legacy events", async () => {
    if (!requireDatabase()) return;
    if (process.env.E2E_TENANT_RLS_ROLE !== TENANT_RLS_ROLE) {
      throw new Error(
        "Attendance correction RLS test requires the tenant RLS role",
      );
    }

    const actorId = randomUUID();
    const groupId = randomUUID();
    const childId = randomUUID();
    const attendanceId = randomUUID();
    const eventId = randomUUID();

    await expect(
      withTenantRlsContext(
        siteId,
        orgId,
        async (tx: Prisma.TransactionClient) => {
          await tx.user.create({
            data: {
              id: actorId,
              email: `${actorId}@example.test`,
              tenantId: siteId,
            },
          });
          await tx.siteMembership.create({
            data: { tenantId: siteId, userId: actorId },
          });
          await tx.group.create({
            data: {
              id: groupId,
              tenantId: siteId,
              name: `Register ${groupId}`,
            },
          });
          await tx.child.create({
            data: {
              id: childId,
              tenantId: siteId,
              groupId,
              firstName: "Attendance",
              lastName: "Fixture",
            },
          });
          await tx.attendance.create({
            data: {
              id: attendanceId,
              childId,
              groupId,
              present: false,
              status: "ABSENT",
            },
          });

          await tx.$executeRawUnsafe(`SET LOCAL ROLE "${TENANT_RLS_ROLE}"`);
          await tx.$executeRaw`
            INSERT INTO "AttendanceCorrectionEvent" (
              "id", "tenantId", "childId", "attendanceId", "previousStatus",
              "newStatus", "reason", "correctedByUserId", "origin"
            ) VALUES (
              ${eventId}, ${siteId}, ${childId}, ${attendanceId}, 'PRESENT',
              'ABSENT', 'Register corrected', ${actorId}, 'LIVE'
            )
          `;
          const sameSite = await tx.attendanceCorrectionEvent.findMany({
            where: { attendanceId },
            select: { id: true, previousStatus: true, newStatus: true },
          });
          expect(sameSite).toEqual([
            { id: eventId, previousStatus: "PRESENT", newStatus: "ABSENT" },
          ]);

          await tx.$executeRaw`SELECT set_config('app.tenant_id', ${otherSiteId}, true)`;
          expect(
            await tx.attendanceCorrectionEvent.findMany({
              where: { attendanceId },
            }),
          ).toEqual([]);

          await tx.$executeRaw`SELECT set_config('app.tenant_id', ${siteId}, true)`;
          await tx.$executeRaw`
            INSERT INTO "AttendanceCorrectionEvent" (
              "id", "tenantId", "childId", "attendanceId", "previousStatus",
              "newStatus", "reason", "correctedByUserId", "origin"
            ) VALUES (
              ${randomUUID()}, ${siteId}, ${childId}, ${attendanceId}, NULL,
              'ABSENT', 'Forged legacy entry', ${actorId}, 'LEGACY_BACKFILL'
            )
          `;
          throw new Error("Forged legacy correction was accepted");
        },
      ),
    ).rejects.toMatchObject({ code: "P2010", meta: { code: "23514" } });
  });
});
