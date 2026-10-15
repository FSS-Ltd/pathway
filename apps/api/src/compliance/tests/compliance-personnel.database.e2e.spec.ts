import { randomUUID } from "node:crypto";
import { Prisma, prisma, withTenantRlsContext } from "@pathway/db";
import { isEncryptedField } from "@pathway/util";
import { requireDatabase } from "../../../test-helpers.e2e";

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Compliance database tests require ${name}`);
  return value;
}
const orgId = requiredEnvironment("E2E_ORG_ID");
const tenantId = requiredEnvironment("E2E_TENANT_ID");
const otherTenantId = requiredEnvironment("E2E_TENANT2_ID");
const rollback = new Error("rollback compliance fixture");

async function fixture(
  run: (tx: Prisma.TransactionClient, actorId: string) => Promise<void>,
) {
  if (!requireDatabase()) return;
  if (process.env.E2E_TENANT_RLS_ROLE !== "pathway_e2e_tenant_rls") {
    throw new Error("Compliance database tests require the tenant RLS role");
  }
  await expect(
    withTenantRlsContext(tenantId, orgId, async (tx) => {
      const actor = await tx.user.create({
        data: { tenantId, name: "Test staff" },
      });
      await run(tx, actor.id);
      throw rollback;
    }),
  ).rejects.toBe(rollback);
}

function recordData(
  actorId: string,
): Prisma.CompliancePersonnelRecordUncheckedCreateInput {
  return {
    tenantId: tenantId,
    orgId: orgId,
    subjectName: "Alex Example",
    subjectUserId: actorId,
    roleDescription: "Volunteer supervisor",
    kind: "BACKGROUND_CHECK",
    scheme: "DBS",
    title: "Role-appropriate check",
    provider: "Verification provider",
    reference: "Private reference",
    notes: "Private context",
    verificationNotes: "Awaiting verification",
    status: "RECORDED",
    createdByUserId: actorId,
    updatedByUserId: actorId,
  };
}

async function rejectedWrite(
  tx: Prisma.TransactionClient,
  write: () => Promise<unknown>,
) {
  await tx.$executeRawUnsafe("SAVEPOINT compliance_expected_rejection");
  await expect(write()).rejects.toThrow();
  await tx.$executeRawUnsafe(
    "ROLLBACK TO SAVEPOINT compliance_expected_rejection",
  );
  await tx.$executeRawUnsafe("RELEASE SAVEPOINT compliance_expected_rejection");
}

async function restrict(tx: Prisma.TransactionClient) {
  await tx.$executeRawUnsafe('SET LOCAL ROLE "pathway_e2e_tenant_rls"');
}

describe("compliance personnel database boundaries", () => {
  it("forces tenant/org RLS and keeps browser database roles out", async () => {
    if (!requireDatabase()) return;
    const rows = await prisma.$queryRaw<
      Array<{
        name: string;
        enabled: boolean;
        forced: boolean;
        publicGrant: boolean;
      }>
    >`
      SELECT c.relname AS name, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced,
        EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))) g
          WHERE g.grantee = 0 OR g.grantee IN (pg_catalog.to_regrole('anon')::oid, pg_catalog.to_regrole('authenticated')::oid)) AS "publicGrant"
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relname IN ('CompliancePersonnelRecord', 'CompliancePersonnelRevision')
      ORDER BY c.relname
    `;
    expect(rows).toEqual(
      ["CompliancePersonnelRecord", "CompliancePersonnelRevision"].map(
        (name) => ({ name, enabled: true, forced: true, publicGrant: false }),
      ),
    );
  });

  it("encrypts personnel and revision content, isolates both tables, and rejects mismatched writes", async () => {
    await fixture(async (tx, actorId) => {
      await restrict(tx);
      const record = await tx.compliancePersonnelRecord.create({
        data: recordData(actorId),
      });
      const revision = await tx.compliancePersonnelRevision.create({
        data: {
          tenantId: tenantId,
          orgId: orgId,
          recordId: record.id,
          version: 1,
          actorUserId: actorId,
          snapshot: {
            subjectName: record.subjectName,
            notes: record.notes,
            version: 1,
          },
        },
      });
      expect(record.subjectName).toBe("Alex Example");
      expect(revision.snapshot).toEqual({
        subjectName: "Alex Example",
        notes: "Private context",
        version: 1,
      });
      const raw = await tx.$queryRaw<Array<Record<string, unknown>>>`
        SELECT "subjectName", "roleDescription", title, provider, reference, notes, "verificationNotes"
        FROM "CompliancePersonnelRecord" WHERE id = ${record.id}
      `;
      for (const value of Object.values(raw[0]))
        expect(isEncryptedField(String(value))).toBe(true);
      const snapshots = await tx.$queryRaw<
        Array<{ snapshot: unknown }>
      >`SELECT snapshot FROM "CompliancePersonnelRevision" WHERE id = ${revision.id}`;
      expect(snapshots).toEqual([{ snapshot: { __enc: expect.any(String) } }]);
      for (const [context, value] of [
        ["app.tenant_id", otherTenantId],
        ["app.org_id", randomUUID()],
      ]) {
        await tx.$executeRaw`SELECT set_config(${context}, ${value}, true)`;
        expect(await tx.compliancePersonnelRecord.count()).toBe(0);
        expect(await tx.compliancePersonnelRevision.count()).toBe(0);
        await rejectedWrite(tx, () =>
          tx.compliancePersonnelRecord.create({ data: recordData(actorId) }),
        );
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
        await tx.$executeRaw`SELECT set_config('app.org_id', ${orgId}, true)`;
      }
      await rejectedWrite(tx, () =>
        tx.compliancePersonnelRevision.create({
          data: {
            tenantId: otherTenantId,
            orgId: orgId,
            recordId: record.id,
            version: 2,
            actorUserId: actorId,
            snapshot: {},
          },
        }),
      );
      await rejectedWrite(tx, () =>
        tx.compliancePersonnelRecord.update({
          where: { id: record.id },
          data: { tenantId: otherTenantId },
        }),
      );
    });
  });

  it("rejects foreign or inactive new subjects and retains evidence after a subject leaves", async () => {
    await fixture(async (tx, actorId) => {
      const foreign = await tx.user.create({
        data: { tenantId: otherTenantId },
      });
      const inactive = await tx.user.create({
        data: { tenantId, isActive: false },
      });
      await restrict(tx);
      for (const subjectUserId of [foreign.id, inactive.id]) {
        await rejectedWrite(tx, () =>
          tx.compliancePersonnelRecord.create({
            data: { ...recordData(actorId), subjectUserId },
          }),
        );
      }
      const record = await tx.compliancePersonnelRecord.create({
        data: recordData(actorId),
      });
      await tx.compliancePersonnelRevision.create({
        data: {
          tenantId: tenantId,
          orgId: orgId,
          recordId: record.id,
          version: 1,
          actorUserId: actorId,
          snapshot: { subjectName: record.subjectName },
        },
      });
      await tx.$executeRawUnsafe("RESET ROLE");
      await tx.user.update({
        where: { id: actorId },
        data: { tenantId: null, isActive: false },
      });
      await restrict(tx);
      const archived = await tx.compliancePersonnelRecord.update({
        where: { id: record.id },
        data: { archivedAt: new Date(), version: 2 },
      });
      expect(archived.subjectName).toBe("Alex Example");
      expect(
        await tx.compliancePersonnelRevision.count({
          where: { recordId: record.id },
        }),
      ).toBe(1);
    });
  });

  it("enforces composite ownership and verification metadata even for an owner connection", async () => {
    await fixture(async (tx, actorId) => {
      const otherOrg = await tx.org.create({
        data: {
          name: "Other institution",
          slug: randomUUID(),
          planCode: "trial",
        },
      });
      await rejectedWrite(tx, () =>
        tx.compliancePersonnelRecord.create({
          data: { ...recordData(actorId), orgId: otherOrg.id },
        }),
      );
      await rejectedWrite(tx, () =>
        tx.compliancePersonnelRecord.create({
          data: { ...recordData(actorId), status: "VERIFIED" },
        }),
      );
      await rejectedWrite(tx, () =>
        tx.compliancePersonnelRecord.create({
          data: { ...recordData(actorId), scheme: null },
        }),
      );
      const record = await tx.compliancePersonnelRecord.create({
        data: recordData(actorId),
      });
      await rejectedWrite(tx, () =>
        tx.compliancePersonnelRevision.create({
          data: {
            tenantId: otherTenantId,
            orgId,
            recordId: record.id,
            version: 1,
            actorUserId: actorId,
            snapshot: {},
          },
        }),
      );
      await rejectedWrite(tx, () =>
        tx.compliancePersonnelRecord.update({
          where: { id: record.id },
          data: { orgId: otherOrg.id },
        }),
      );
    });
  });

  it("preserves immutable history even when the database owner attempts mutation", async () => {
    await fixture(async (tx, actorId) => {
      const record = await tx.compliancePersonnelRecord.create({
        data: recordData(actorId),
      });
      const revision = await tx.compliancePersonnelRevision.create({
        data: {
          tenantId: tenantId,
          orgId: orgId,
          recordId: record.id,
          version: 1,
          actorUserId: actorId,
          snapshot: { subjectName: record.subjectName },
        },
      });
      await rejectedWrite(tx, () =>
        tx.compliancePersonnelRevision.update({
          where: { id: revision.id },
          data: { snapshot: {} },
        }),
      );
      await rejectedWrite(tx, () =>
        tx.compliancePersonnelRevision.delete({ where: { id: revision.id } }),
      );
      await rejectedWrite(tx, () =>
        tx.compliancePersonnelRecord.delete({ where: { id: record.id } }),
      );
      expect(
        (
          await tx.compliancePersonnelRevision.findUnique({
            where: { id: revision.id },
          })
        )?.snapshot,
      ).toEqual({ subjectName: "Alex Example" });
    });
  });
});
