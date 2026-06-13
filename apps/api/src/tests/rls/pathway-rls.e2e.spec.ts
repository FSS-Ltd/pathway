import { randomUUID } from "node:crypto";
import { Prisma, Role, withTenantRlsContext } from "@pathway/db";
import {
  requireDatabase,
  isDatabaseAvailable,
} from "../../../test-helpers.e2e";

const TENANT_A = process.env.E2E_TENANT_ID as string;
const TENANT_B = process.env.E2E_TENANT2_ID as string;

const SUPABASE_RLS_HARDENED_TABLES = [
  "_GroupToSession",
  "_ParentChildren",
  "_prisma_migrations",
  "AutomationApiToken",
  "AutomationBlogPublishAudit",
  "BillingEvent",
  "BlogAsset",
  "BlogPost",
  "DownloadToken",
  "EmergencyContact",
  "HandoverLog",
  "HandoverLogVersion",
  "Invite",
  "Lead",
  "OrgEntitlementSnapshot",
  "OrgMembership",
  "OrgRetentionPolicy",
  "ParentSignupConsent",
  "PublicSignupLink",
  "SessionStaffAttendance",
  "SiteMembership",
  "StaffPreferredGroup",
  "StaffUnavailableDate",
  "Subscription",
  "UsageCounters",
  "UserIdentity",
] as const;

interface TenantFixtures {
  childId: string;
  noteId: string;
  concernId: string;
  sessionId: string;
  attendanceId: string;
  assignmentId: string;
  userId: string;
  orgId: string;
}

async function seedTenantData(
  tenantId: string,
  orgId: string,
  label: string,
): Promise<TenantFixtures> {
  const userId = randomUUID();
  const groupId = randomUUID();
  const childId = randomUUID();
  const noteId = randomUUID();
  const concernId = randomUUID();
  const sessionId = randomUUID();
  const assignmentId = randomUUID();
  const attendanceId = randomUUID();
  const baseTime = new Date("2025-01-01T09:00:00.000Z");

  await withTenantRlsContext(
    tenantId,
    orgId,
    async (tx: Prisma.TransactionClient) => {
      await tx.user.create({
        data: {
          id: userId,
          // Use a run-unique email to avoid cross-run unique conflicts on the global email index.
          email: `teacher-${label}-${userId}@example.test`,
          tenantId,
          name: `Teacher ${label}`,
        },
      });

      await tx.group.create({
        data: {
          id: groupId,
          name: `Group ${label}`,
          minAge: 6,
          maxAge: 7,
          tenantId,
        },
      });

      await tx.child.create({
        data: {
          id: childId,
          firstName: `Child${label}`,
          lastName: "Demo",
          tenantId,
          groupId,
        },
      });

      await tx.session.create({
        data: {
          id: sessionId,
          tenantId,
          groups: { connect: [{ id: groupId }] },
          startsAt: baseTime,
          endsAt: new Date(baseTime.getTime() + 60 * 60 * 1000),
          title: `Session ${label}`,
        },
      });

      await tx.assignment.create({
        data: {
          id: assignmentId,
          sessionId,
          userId,
          role: Role.TEACHER,
        },
      });

      await tx.childNote.create({
        data: {
          id: noteId,
          childId,
          authorId: userId,
          text: `Note ${label}`,
        },
      });

      await tx.concern.create({
        data: {
          id: concernId,
          childId,
          summary: `Concern ${label}`,
        },
      });

      await tx.attendance.create({
        data: {
          id: attendanceId,
          childId,
          groupId,
          sessionId,
          present: true,
        },
      });
    },
  );

  return {
    childId,
    noteId,
    concernId,
    sessionId,
    attendanceId,
    assignmentId,
    userId,
    orgId,
  };
}

describe("Postgres RLS policies", () => {
  const fixtures: Record<string, TenantFixtures> = {};

  beforeAll(async () => {
    if (!requireDatabase()) {
      return;
    }

    const tenantIds = [TENANT_A, TENANT_B];
    for (const tenantId of tenantIds) {
      const tenant = await withTenantRlsContext(tenantId, null, async (tx) =>
        tx.tenant.findUnique({
          where: { id: tenantId },
          select: { id: true, orgId: true },
        }),
      );

      if (!tenant) {
        throw new Error(
          `E2E tenant ${tenantId} missing - ensure test.setup.e2e.ts seeded Tenant A & B`,
        );
      }

      const label = tenantId === TENANT_A ? "A" : "B";
      fixtures[tenant.id] = await seedTenantData(
        tenant.id,
        tenant.orgId,
        label,
      );
    }
  });

  it("verifies RLS context is set correctly", async () => {
    if (!isDatabaseAvailable() || !fixtures[TENANT_A]) return;
    const result = await withTenantRlsContext(
      TENANT_A,
      fixtures[TENANT_A].orgId,
      async (tx) => {
        const [row] = await tx.$queryRaw<
          Array<{ tid: string | null; oid: string | null }>
        >`
          SELECT app.current_tenant_id() as tid, app.current_org_id() as oid
        `;
        return row;
      },
    );
    expect(result.tid).toBe(TENANT_A);
    expect(result.oid).toBe(fixtures[TENANT_A].orgId);
  });

  it("verifies RLS is enabled and forced on Child table", async () => {
    if (!isDatabaseAvailable() || !fixtures[TENANT_A]) return;
    const result = await withTenantRlsContext(
      TENANT_A,
      fixtures[TENANT_A].orgId,
      async (tx) => {
        const [row] = await tx.$queryRaw<
          Array<{
            relname: string;
            relrowsecurity: boolean;
            relforcerowsecurity: boolean;
          }>
        >`
          SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname = 'Child' AND n.nspname = current_schema()
        `;
        return row;
      },
    );
    expect(result.relrowsecurity).toBe(true);
    expect(result.relforcerowsecurity).toBe(true);
  });

  it("verifies a Child policy exists", async () => {
    if (!isDatabaseAvailable() || !fixtures[TENANT_A]) return;
    const policies = await withTenantRlsContext(
      TENANT_A,
      fixtures[TENANT_A].orgId,
      async (tx) =>
        tx.$queryRaw<
          Array<{
            policyname: string;
            tablename: string;
            permissive: string;
            roles: string[];
          }>
        >`
          SELECT policyname, tablename, permissive, roles
          FROM pg_policies
          WHERE tablename = 'Child' AND schemaname = current_schema()
        `,
    );
    expect(policies.length).toBeGreaterThan(0);
  });

  it("verifies newly hardened Supabase public tables have RLS enabled", async () => {
    if (!isDatabaseAvailable() || !fixtures[TENANT_A]) return;
    const rows = await withTenantRlsContext(
      TENANT_A,
      fixtures[TENANT_A].orgId,
      async (tx) =>
        tx.$queryRaw<
          Array<{
            relname: string;
            relrowsecurity: boolean;
          }>
        >`
          SELECT c.relname, c.relrowsecurity
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = current_schema()
            AND c.relkind IN ('r', 'p')
            AND c.relname IN (${Prisma.join(SUPABASE_RLS_HARDENED_TABLES)})
          ORDER BY c.relname
        `,
    );

    expect(rows.map((row) => row.relname).sort()).toEqual(
      [...SUPABASE_RLS_HARDENED_TABLES].sort(),
    );
    expect(rows.filter((row) => !row.relrowsecurity)).toEqual([]);
  });

  it("verifies anon and authenticated have no direct grants on hardened public tables", async () => {
    if (!isDatabaseAvailable() || !fixtures[TENANT_A]) return;
    const grants = await withTenantRlsContext(
      TENANT_A,
      fixtures[TENANT_A].orgId,
      async (tx) =>
        tx.$queryRaw<
          Array<{
            table_name: string;
            grantee: string;
            privilege_type: string;
          }>
        >`
          SELECT tp.table_name, tp.grantee, tp.privilege_type
          FROM information_schema.table_privileges tp
          WHERE tp.table_schema = current_schema()
            AND tp.grantee IN ('anon', 'authenticated')
            AND tp.table_name IN (${Prisma.join(SUPABASE_RLS_HARDENED_TABLES)})
          ORDER BY tp.table_name, tp.grantee, tp.privilege_type
        `,
    );

    expect(grants).toEqual([]);
  });

  it("returns only in-tenant children and notes", async () => {
    if (!isDatabaseAvailable() || !fixtures[TENANT_A]) return;
    const { childId, noteId, orgId } = fixtures[TENANT_A];
    const result = await withTenantRlsContext(TENANT_A, orgId, async (tx) => {
      const children = await tx.child.findMany({ select: { id: true } });
      const notes = await tx.childNote.findMany({ select: { id: true } });
      return {
        childIds: children.map((c) => c.id),
        noteIds: notes.map((n) => n.id),
      };
    });

    expect(result.childIds).toEqual(expect.arrayContaining([childId]));
    expect(result.noteIds).toEqual(expect.arrayContaining([noteId]));
  });

  it("blocks cross-tenant note lookups silently", async () => {
    if (!isDatabaseAvailable() || !fixtures[TENANT_A] || !fixtures[TENANT_B])
      return;
    const targetNote = fixtures[TENANT_B].noteId;
    await withTenantRlsContext(
      TENANT_A,
      fixtures[TENANT_A].orgId,
      async (tx) => {
        const note = await tx.childNote.findUnique({
          where: { id: targetNote },
        });
        expect(note).toBeNull();
      },
    );
  });

  it("raises P2025 when updating another tenant's concern", async () => {
    if (!isDatabaseAvailable() || !fixtures[TENANT_A] || !fixtures[TENANT_B])
      return;
    await expect(
      withTenantRlsContext(TENANT_A, fixtures[TENANT_A].orgId, async (tx) =>
        tx.concern.update({
          where: { id: fixtures[TENANT_B].concernId },
          data: { summary: "not allowed" },
        }),
      ),
    ).rejects.toMatchObject({ code: "P2025" });
  });

  it("counts only attendance rows for the active tenant", async () => {
    if (!isDatabaseAvailable() || !fixtures[TENANT_A] || !fixtures[TENANT_B])
      return;
    const countA = await withTenantRlsContext(
      TENANT_A,
      fixtures[TENANT_A].orgId,
      async (tx) => tx.attendance.count(),
    );
    const countB = await withTenantRlsContext(
      TENANT_B,
      fixtures[TENANT_B].orgId,
      async (tx) => tx.attendance.count(),
    );

    expect(countA).toBeGreaterThanOrEqual(1);
    expect(countB).toBeGreaterThanOrEqual(1);
  });

  it("allows in-tenant session + assignment updates", async () => {
    if (!isDatabaseAvailable() || !fixtures[TENANT_A]) return;
    const { sessionId, orgId } = fixtures[TENANT_A];
    const updated = await withTenantRlsContext(TENANT_A, orgId, async (tx) =>
      tx.session.update({
        where: { id: sessionId },
        data: { title: "Updated Session A" },
      }),
    );
    expect(updated.title).toBe("Updated Session A");
  });

  it("rejects cross-tenant session updates", async () => {
    if (!isDatabaseAvailable() || !fixtures[TENANT_A] || !fixtures[TENANT_B])
      return;
    await expect(
      withTenantRlsContext(TENANT_A, fixtures[TENANT_A].orgId, async (tx) =>
        tx.session.update({
          where: { id: fixtures[TENANT_B].sessionId },
          data: { title: "should fail" },
        }),
      ),
    ).rejects.toMatchObject({ code: "P2025" });
  });
});
