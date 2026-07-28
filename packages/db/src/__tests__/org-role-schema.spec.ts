import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type { PrismaClientType } from "../index";

const schema = readFileSync(
  path.resolve(process.cwd(), "prisma/schema.prisma"),
  "utf8",
);

const rlsGate = readFileSync(
  path.resolve(process.cwd(), "../../scripts/check-supabase-rls.mjs"),
  "utf8",
);

const rlsWorkflow = readFileSync(
  path.resolve(process.cwd(), "../../.github/workflows/ci.yml"),
  "utf8",
);

const roleRevisionMigration = readFileSync(
  path.resolve(
    process.cwd(),
    "prisma/migrations/20260728120000_org_role_revisions/migration.sql",
  ),
  "utf8",
);

describe("organisation role schema contract", () => {
  it("declares organisation role definitions backed by platform permission keys", () => {
    expect(schema).toContain("enum RoleScope");
    expect(schema).toContain("model OrgRoleDefinition");
    expect(schema).toContain("model OrgRolePermission");
    expect(schema).toContain("model OrgRoleRevision");
    expect(schema).toMatch(/permissionKey\s+String/);
    expect(schema).toMatch(
      /permission\s+PermissionDefinition\s+@relation\(fields: \[permissionKey\], references: \[key\]\)/,
    );
  });

  it("requires active role metadata to be isolated by organisation and site", () => {
    expect(schema).toContain("@@unique([id, orgId])");
    expect(schema).toContain("@@unique([orgId, tenantId, name, isSystem])");
    expect(schema).toContain("@@index([orgId, tenantId, isActive])");
    expect(schema).toMatch(
      /tenant\s+Tenant\?\s+@relation\(fields: \[tenantId, orgId\], references: \[id, orgId\]\)/,
    );
  });

  it("makes missing organisation role tables a strict RLS gate failure", () => {
    expect(rlsGate).toContain('"OrgRoleDefinition"');
    expect(rlsGate).toContain('"OrgRolePermission"');
    expect(rlsGate).toContain('"OrgRoleRevision"');
    expect(rlsGate).toContain("relforcerowsecurity");
    expect(rlsGate).toContain("schemaFromDatabaseUrl");
    expect(rlsGate).toContain("pg_get_expr(p.polqual, p.polrelid)");
    expect(rlsGate).toContain("p.polpermissive AS permissive");
    expect(rlsGate).toContain("unnest(p.polroles)");
    expect(rlsGate).toContain("role_oid = 0 THEN 'PUBLIC'");
    expect(rlsGate).toContain("findUnreviewedRolePolicies");
    expect(rlsGate).toContain("'PUBLIC', 'anon', 'authenticated'");
    expect(rlsGate).toContain("const [unforcedTables, disabledTables");
    expect(rlsGate).toContain("disabledRequiredTables");
    expect(rlsGate).toContain("requiredPublicRoleGrants");
    expect(rlsGate).toContain('schema !== "app"');
    expect(rlsGate).toMatch(
      /relforcerowsecurity = false[\s\S]*'PermissionDefinition'/,
    );
    const forceRlsPredicate = rlsGate.indexOf("relforcerowsecurity = false");
    const disabledRlsPredicate = rlsGate.indexOf("relrowsecurity = false");
    const resultNames = rlsGate.indexOf(
      "const [unforcedTables, disabledTables",
    );
    expect(forceRlsPredicate).toBeGreaterThan(-1);
    expect(disabledRlsPredicate).toBeGreaterThan(forceRlsPredicate);
    expect(resultNames).toBeGreaterThan(disabledRlsPredicate);
    expect(rlsGate).toMatch(
      /if \(disabledTables\.length > 0\)[\s\S]*RLS disabled/,
    );
    expect(rlsGate).toMatch(
      /if \(unforcedTables\.length > 0\)[\s\S]*do not force RLS/,
    );
    expect(rlsWorkflow).toMatch(
      /Test organisation role RLS policy gate contract[\s\S]*node --test scripts\/lib\/role-rls-gate\.test\.mjs[\s\S]*Verify organisation role RLS policies/,
    );
  });

  it("enforces immutable, role-consistent revision snapshots and organisation audit access", () => {
    expect(roleRevisionMigration).toContain("app.enforce_org_role_revision_immutable");
    expect(roleRevisionMigration).toContain("BEFORE UPDATE OR DELETE");
    expect(roleRevisionMigration).toContain("app.validate_org_role_revision");
    expect(roleRevisionMigration).toContain('role_record app."OrgRoleDefinition"%ROWTYPE');
    expect(roleRevisionMigration).toContain('FROM app."OrgRoleDefinition"');
    expect(roleRevisionMigration).toContain("SET search_path = ''");
    expect(roleRevisionMigration).toContain('DROP POLICY IF EXISTS "AuditEvent_tenant_rls"');
    expect(roleRevisionMigration).toContain('CREATE POLICY "AuditEvent_org_or_site_rls"');
  });
});

const describeIfDb =
  process.env.PATHWAY_RUN_DB_INTEGRATION_TESTS === "1"
    ? describe
    : describe.skip;

describeIfDb("organisation role schema database constraints", () => {
  let prisma: PrismaClientType;
  const orgIds: string[] = [];

  beforeAll(async () => {
    const hostname = new URL(process.env.DATABASE_URL ?? "").hostname;
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      throw new Error(
        `Refusing to run: DATABASE_URL host "${hostname}" is not local. ` +
          "Set DATABASE_URL to the docker-compose db before running this suite.",
      );
    }

    prisma = (await import("../index")).prisma;
  });

  afterEach(async () => {
    for (const orgId of orgIds.splice(0)) {
      await prisma.orgRoleDefinition.deleteMany({ where: { orgId } });
      await prisma.tenant.deleteMany({ where: { orgId } });
      await prisma.org.delete({ where: { id: orgId } });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("enforces same-organisation sites, role name uniqueness, and platform permission keys", async () => {
    const orgA = await prisma.org.create({
      data: {
        id: randomUUID(),
        name: "Role schema A",
        slug: `role-schema-a-${randomUUID()}`,
        planCode: "trial",
      },
    });
    const orgB = await prisma.org.create({
      data: {
        id: randomUUID(),
        name: "Role schema B",
        slug: `role-schema-b-${randomUUID()}`,
        planCode: "trial",
      },
    });
    orgIds.push(orgA.id, orgB.id);

    const tenantA = await prisma.tenant.create({
      data: {
        name: "Role schema site A",
        slug: `role-schema-site-a-${randomUUID()}`,
        orgId: orgA.id,
      },
    });
    const tenantB = await prisma.tenant.create({
      data: {
        name: "Role schema site B",
        slug: `role-schema-site-b-${randomUUID()}`,
        orgId: orgB.id,
      },
    });
    const roleName = `Staff ${randomUUID()}`;
    const roleA = await prisma.orgRoleDefinition.create({
      data: {
        orgId: orgA.id,
        tenantId: tenantA.id,
        name: roleName,
        scope: "site",
        createdById: randomUUID(),
        updatedById: randomUUID(),
      },
    });

    await expect(
      prisma.orgRoleDefinition.create({
        data: {
          orgId: orgA.id,
          tenantId: tenantB.id,
          name: `Cross-org site ${randomUUID()}`,
          scope: "site",
          createdById: randomUUID(),
          updatedById: randomUUID(),
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });

    await expect(
      prisma.orgRoleDefinition.create({
        data: {
          orgId: orgA.id,
          name: `Unscoped site role ${randomUUID()}`,
          scope: "site",
          createdById: randomUUID(),
          updatedById: randomUUID(),
        },
      }),
    ).rejects.toMatchObject({ code: "P2004" });

    await expect(
      prisma.orgRoleDefinition.create({
        data: {
          orgId: orgA.id,
          name: `Custom relationship role ${randomUUID()}`,
          scope: "relationship",
          createdById: randomUUID(),
          updatedById: randomUUID(),
        },
      }),
    ).rejects.toMatchObject({ code: "P2004" });

    await expect(
      prisma.orgRoleDefinition.create({
        data: {
          orgId: orgA.id,
          tenantId: tenantA.id,
          name: roleName,
          scope: "site",
          createdById: randomUUID(),
          updatedById: randomUUID(),
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    await prisma.orgRoleDefinition.create({
      data: {
        orgId: orgA.id,
        name: roleName,
        scope: "organisation",
        createdById: randomUUID(),
        updatedById: randomUUID(),
      },
    });

    await expect(
      prisma.orgRoleDefinition.create({
        data: {
          orgId: orgA.id,
          name: roleName,
          scope: "organisation",
          createdById: randomUUID(),
          updatedById: randomUUID(),
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    await expect(
      prisma.orgRolePermission.create({
        data: {
          roleDefinitionId: roleA.id,
          permissionKey: `unknown.permission.${randomUUID()}`,
          grantedById: randomUUID(),
        },
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("validates a role revision when the transaction search path is empty", async () => {
    const org = await prisma.org.create({
      data: {
        id: randomUUID(),
        name: "Revision search path",
        slug: `revision-search-path-${randomUUID()}`,
        planCode: "trial",
      },
    });
    orgIds.push(org.id);
    const rollback = new Error("rollback revision search-path fixture");

    await expect(
      prisma.$transaction(async (tx) => {
        const role = await tx.orgRoleDefinition.create({
          data: {
            orgId: org.id,
            name: `Revision search path role ${randomUUID()}`,
            scope: "organisation",
            createdById: randomUUID(),
            updatedById: randomUUID(),
          },
        });

        await tx.$executeRawUnsafe("SET LOCAL search_path = ''");
        await tx.$executeRaw`
          INSERT INTO app."OrgRoleRevision" (
            "id", "roleDefinitionId", "orgId", "tenantId", "version", "name",
            "description", "scope", "isActive", "permissionKeys", "actorUserId"
          ) VALUES (
            ${randomUUID()}, ${role.id}, ${org.id}, NULL, ${role.version},
            ${role.name}, NULL, 'organisation'::app."RoleScope", ${role.isActive},
            '[]'::jsonb, ${randomUUID()}
          )
        `;
        const revisions = await tx.$queryRaw<Array<{ roleDefinitionId: string }>>`
          SELECT "roleDefinitionId"
          FROM app."OrgRoleRevision"
          WHERE "roleDefinitionId" = ${role.id}
        `;
        expect(revisions).toEqual([{ roleDefinitionId: role.id }]);

        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });
});
