import { randomUUID } from "node:crypto";
import { Prisma, prisma, withTenantRlsContext } from "@pathway/db";
import { requireDatabase } from "../../../test-helpers.e2e";

const orgId = process.env.E2E_ORG_ID;
const siteId = process.env.E2E_TENANT_ID;
const otherSiteId = process.env.E2E_TENANT2_ID;
if (!orgId || !siteId || !otherSiteId) {
  throw new Error("Registration RLS test requires seeded E2E sites");
}

const rollback = new Error("rollback registration RLS fixture");

describe("submitted registration storage", () => {
  it("forces RLS and does not grant public Data API access", async () => {
    if (!requireDatabase()) return;
    const rows = await prisma.$queryRaw<
      Array<{ enabled: boolean; forced: boolean; publicGrant: boolean }>
    >`
      SELECT c.relrowsecurity AS "enabled", c.relforcerowsecurity AS "forced",
             EXISTS (
               SELECT 1 FROM pg_catalog.aclexplode(
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
      WHERE n.nspname = 'app' AND c.relname = 'ChildRegistrationSubmission'
    `;
    expect(rows).toEqual([{ enabled: true, forced: true, publicGrant: false }]);
  });

  it("allows staff to read only their site and hides submissions from guardians", async () => {
    if (!requireDatabase()) return;
    if (process.env.E2E_TENANT_RLS_ROLE !== "pathway_e2e_tenant_rls") {
      throw new Error("Registration RLS test requires the tenant RLS role");
    }
    const staffId = randomUUID();
    const guardianId = randomUUID();
    const childId = randomUUID();
    const submissionId = randomUUID();

    await expect(
      withTenantRlsContext(
        siteId,
        orgId,
        async (tx: Prisma.TransactionClient) => {
          await tx.user.create({
            data: {
              id: staffId,
              email: `${staffId}@example.test`,
              tenantId: siteId,
            },
          });
          await tx.user.create({
            data: {
              id: guardianId,
              email: `${guardianId}@example.test`,
              tenantId: siteId,
            },
          });
          await tx.siteMembership.create({
            data: { tenantId: siteId, userId: staffId, role: "STAFF" },
          });
          await tx.siteMembership.create({
            data: { tenantId: siteId, userId: guardianId, role: "VIEWER" },
          });
          await tx.child.create({
            data: {
              id: childId,
              tenantId: siteId,
              firstName: "Test",
              lastName: "Child",
            },
          });
          await tx.$executeRawUnsafe('SET LOCAL ROLE "pathway_e2e_tenant_rls"');
          await tx.$executeRaw`SELECT set_config('app.user_id', '', true)`;
          const inserted = await tx.childRegistrationSubmission.createMany({
            data: [
              {
                id: submissionId,
                tenantId: siteId,
                childId,
                formVersion: "2.0",
                payload: { household: { homeAddress: "Test address" } },
              },
            ],
          });

          expect(inserted.count).toBe(1);
          await tx.$executeRaw`SELECT set_config('app.user_id', ${staffId}, true)`;
          expect(
            await tx.childRegistrationSubmission.count({
              where: { id: submissionId },
            }),
          ).toBe(1);
          const stored = await tx.$queryRaw<Array<{ payload: unknown }>>`
            SELECT "payload" FROM "ChildRegistrationSubmission" WHERE "id" = ${submissionId}
          `;
          expect(stored).toEqual([{ payload: { __enc: expect.any(String) } }]);
          const decrypted = await tx.childRegistrationSubmission.findFirst({
            where: { id: submissionId },
            select: { payload: true },
          });
          expect(decrypted?.payload).toEqual({
            household: { homeAddress: "Test address" },
          });

          await tx.$executeRaw`SELECT set_config('app.user_id', ${guardianId}, true)`;
          expect(
            await tx.childRegistrationSubmission.count({
              where: { id: submissionId },
            }),
          ).toBe(0);

          await tx.$executeRaw`SELECT set_config('app.user_id', ${staffId}, true)`;
          await tx.$executeRaw`SELECT set_config('app.tenant_id', ${otherSiteId}, true)`;
          expect(
            await tx.childRegistrationSubmission.count({
              where: { id: submissionId },
            }),
          ).toBe(0);
          throw rollback;
        },
      ),
    ).rejects.toBe(rollback);
  });
});
