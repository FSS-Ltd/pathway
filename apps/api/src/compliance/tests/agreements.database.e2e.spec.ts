import { randomUUID } from "node:crypto";
import { prisma, withTenantRlsContext, type Prisma } from "@pathway/db";
import { requireDatabase } from "../../../test-helpers.e2e";
const rollback = new Error("rollback agreement database fixture");
const tables = [
  "ComplianceAgreementAcceptance",
  "ComplianceAgreementAssignment",
  "ComplianceAgreementDocument",
  "ComplianceAgreementVersion",
];
function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
async function rejected(
  tx: Prisma.TransactionClient,
  operation: () => Promise<unknown>,
) {
  await tx.$executeRawUnsafe("SAVEPOINT agreement_rejection");
  await expect(operation()).rejects.toThrow();
  await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT agreement_rejection");
  await tx.$executeRawUnsafe("RELEASE SAVEPOINT agreement_rejection");
}
describe("Agreement database defence in depth", () => {
  it("forces RLS on every institutional agreement table and denies browser database roles", async () => {
    if (!requireDatabase()) return;
    const rows = await prisma.$queryRaw<
      {
        name: string;
        enabled: boolean;
        forced: boolean;
        publicGrant: boolean;
      }[]
    >`
      SELECT c.relname AS name,c.relrowsecurity AS enabled,c.relforcerowsecurity AS forced,
      EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(c.relacl,pg_catalog.acldefault('r',c.relowner))) g WHERE g.grantee=0 OR g.grantee IN (pg_catalog.to_regrole('anon')::oid,pg_catalog.to_regrole('authenticated')::oid)) AS "publicGrant"
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='app' AND c.relname IN ('ComplianceAgreementDocument','ComplianceAgreementVersion','ComplianceAgreementAssignment','ComplianceAgreementAcceptance') ORDER BY c.relname`;
    expect(rows).toEqual(
      tables.map((name) => ({
        name,
        enabled: true,
        forced: true,
        publicGrant: false,
      })),
    );
  });
  it("enforces composite scopes, immutable history and assignment identity with only one supersession", async () => {
    if (!requireDatabase()) return;
    const tenantId = env("E2E_TENANT_ID"),
      orgId = env("E2E_ORG_ID"),
      otherTenantId = env("E2E_TENANT2_ID");
    await expect(
      withTenantRlsContext(tenantId, orgId, async (tx) => {
        const actor = await tx.user.create({
          data: { tenantId, name: "Agreement database actor" },
        });
        const scope = { tenantId, orgId };
        const document = await tx.complianceAgreementDocument.create({
          data: { ...scope, createdByUserId: actor.id, latestVersion: 1 },
        });
        const version = await tx.complianceAgreementVersion.create({
          data: {
            ...scope,
            documentId: document.id,
            version: 1,
            title: "Immutable",
            contentText: "Content",
            createdByUserId: actor.id,
          },
        });
        const assignment = await tx.complianceAgreementAssignment.create({
          data: {
            ...scope,
            versionId: version.id,
            recipientUserId: actor.id,
            assignedByUserId: actor.id,
            adultConfirmedAt: new Date(),
          },
        });
        const acceptance = await tx.complianceAgreementAcceptance.create({
          data: {
            ...scope,
            assignmentId: assignment.id,
            method: "ACKNOWLEDGED",
            typedName: "Actor",
            recordedByUserId: actor.id,
          },
        });
        await rejected(
          tx,
          () =>
            tx.$executeRaw`UPDATE "ComplianceAgreementVersion" SET "title"='tampered' WHERE id=${version.id}`,
        );
        await rejected(
          tx,
          () =>
            tx.$executeRaw`UPDATE "ComplianceAgreementAcceptance" SET "typedName"='tampered' WHERE id=${acceptance.id}`,
        );
        await rejected(
          tx,
          () =>
            tx.$executeRaw`UPDATE "ComplianceAgreementAssignment" SET "recipientUserId"=${randomUUID()} WHERE id=${assignment.id}`,
        );
        await tx.complianceAgreementAssignment.update({
          where: { id: assignment.id },
          data: { supersededAt: new Date() },
        });
        await rejected(tx, () =>
          tx.complianceAgreementAssignment.update({
            where: { id: assignment.id },
            data: { supersededAt: new Date() },
          }),
        );
        await rejected(tx, () =>
          tx.complianceAgreementAssignment.delete({
            where: { id: assignment.id },
          }),
        );
        await rejected(tx, () =>
          tx.complianceAgreementDocument.update({
            where: { id: document.id },
            data: { latestVersion: 3 },
          }),
        );
        await rejected(tx, () =>
          tx.complianceAgreementVersion.create({
            data: {
              ...scope,
              tenantId: otherTenantId,
              documentId: document.id,
              version: 2,
              title: "Wrong scope",
              contentText: "Content",
              createdByUserId: actor.id,
            },
          }),
        );
        await rejected(tx, () =>
          tx.complianceAgreementAssignment.create({
            data: {
              ...scope,
              tenantId: otherTenantId,
              versionId: version.id,
              recipientUserId: actor.id,
              assignedByUserId: actor.id,
              adultConfirmedAt: new Date(),
            },
          }),
        );
        await rejected(tx, () =>
          tx.complianceAgreementAcceptance.create({
            data: {
              ...scope,
              tenantId: otherTenantId,
              assignmentId: assignment.id,
              method: "ACKNOWLEDGED",
              typedName: "Actor",
              recordedByUserId: actor.id,
            },
          }),
        );
        await tx.$executeRawUnsafe('SET LOCAL ROLE "pathway_e2e_tenant_rls"');
        for (const [key, value] of [
          ["app.tenant_id", otherTenantId],
          ["app.org_id", randomUUID()],
        ]) {
          await tx.$executeRaw`SELECT set_config(${key},${value},true)`;
          expect(
            await tx.complianceAgreementDocument.count({
              where: { id: document.id },
            }),
          ).toBe(0);
          expect(
            await tx.complianceAgreementVersion.count({
              where: { id: version.id },
            }),
          ).toBe(0);
          expect(
            await tx.complianceAgreementAssignment.count({
              where: { id: assignment.id },
            }),
          ).toBe(0);
          expect(
            await tx.complianceAgreementAcceptance.count({
              where: { id: acceptance.id },
            }),
          ).toBe(0);
          await rejected(tx, () =>
            tx.complianceAgreementDocument.create({
              data: { ...scope, createdByUserId: actor.id, latestVersion: 1 },
            }),
          );
          await tx.$executeRaw`SELECT set_config('app.tenant_id',${tenantId},true)`;
          await tx.$executeRaw`SELECT set_config('app.org_id',${orgId},true)`;
        }
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });
});
