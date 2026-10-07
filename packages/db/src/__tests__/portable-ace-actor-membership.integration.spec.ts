import { randomUUID } from "node:crypto";
import type { PrismaClientType } from "../index";

const describeIfDb =
  process.env.PATHWAY_RUN_DB_INTEGRATION_TESTS === "1"
    ? describe
    : describe.skip;

describeIfDb("ACE record actor membership in the fact schema", () => {
  let prisma: PrismaClientType;

  beforeAll(async () => {
    const hostname = new URL(process.env.DATABASE_URL ?? "").hostname;
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      throw new Error(
        `Refusing to run: DATABASE_URL host "${hostname}" is not local. ` +
          "Set DATABASE_URL to a disposable local database.",
      );
    }
    prisma = (await import("../index")).prisma;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("accepts the three membership paths and rejects invalid actor scope", async () => {
    const rollback = new Error("rollback ACE actor membership probe");
    const schema = `"ace_actor_${randomUUID().replaceAll("-", "")}"`;

    await expect(
      prisma.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(`CREATE SCHEMA ${schema}`);
          const definitions = [
            `CREATE TABLE ${schema}."SiteMembership" ("tenantId" text, "userId" text)`,
            `CREATE TABLE ${schema}."UserTenantRole" ("tenantId" text, "userId" text)`,
            `CREATE TABLE ${schema}."Tenant" ("id" text, "orgId" text)`,
            `CREATE TABLE ${schema}."OrgMembership" ("orgId" text, "userId" text)`,
            `CREATE TABLE ${schema}."UserRoleAssignment" (
              "orgId" text, "tenantId" text, "userId" text,
              "roleDefinitionId" text, "revokedAt" timestamptz,
              "startsAt" timestamptz, "expiresAt" timestamptz)`,
            `CREATE TABLE ${schema}."OrgRoleDefinition" (
              "id" text, "orgId" text, "tenantId" text,
              "scope" text, "isActive" boolean)`,
            `CREATE TABLE ${schema}."OrgRolePermission" (
              "roleDefinitionId" text, "permissionKey" text)`,
            `CREATE TABLE ${schema}."PermissionDefinition" (
              "key" text, "isActive" boolean)`,
            `CREATE TABLE ${schema}."AceFact" (
              "id" text, "tenantId" text, "actorUserId" text)`,
            `CREATE TRIGGER require_actor BEFORE INSERT ON ${schema}."AceFact"
              FOR EACH ROW EXECUTE FUNCTION
              app.require_ace_record_actor_membership('actorUserId')`,
          ];
          for (const definition of definitions) {
            await tx.$executeRawUnsafe(definition);
          }

          const fixtures = [
            `INSERT INTO ${schema}."SiteMembership" VALUES ('tenant-a', 'site-actor')`,
            `INSERT INTO ${schema}."UserTenantRole" VALUES ('tenant-a', 'legacy-actor')`,
            `INSERT INTO ${schema}."Tenant" VALUES
              ('tenant-a', 'org-a'), ('tenant-b', 'org-b')`,
            `INSERT INTO ${schema}."OrgMembership" VALUES
              ('org-a', 'org-actor'), ('org-a', 'revoked-actor'),
              ('org-a', 'expired-actor'), ('org-a', 'inactive-role-actor'),
              ('org-a', 'inactive-perm-actor')`,
            `INSERT INTO ${schema}."OrgRoleDefinition" VALUES
              ('role-active', 'org-a', NULL, 'organisation', true),
              ('role-inactive', 'org-a', NULL, 'organisation', false),
              ('role-inactive-perm', 'org-a', NULL, 'organisation', true)`,
            `INSERT INTO ${schema}."PermissionDefinition" VALUES
              ('ace.pace.correct', true), ('ace.behaviour.record', false)`,
            `INSERT INTO ${schema}."OrgRolePermission" VALUES
              ('role-active', 'ace.pace.correct'),
              ('role-inactive', 'ace.pace.correct'),
              ('role-inactive-perm', 'ace.behaviour.record')`,
            `INSERT INTO ${schema}."UserRoleAssignment" VALUES
              ('org-a', NULL, 'org-actor', 'role-active', NULL,
               now() - interval '1 day', NULL),
              ('org-a', NULL, 'revoked-actor', 'role-active', now(),
               now() - interval '1 day', NULL),
              ('org-a', NULL, 'expired-actor', 'role-active', NULL,
               now() - interval '2 days', now() - interval '1 day'),
              ('org-a', NULL, 'inactive-role-actor', 'role-inactive', NULL,
               now() - interval '1 day', NULL),
              ('org-a', NULL, 'inactive-perm-actor', 'role-inactive-perm', NULL,
               now() - interval '1 day', NULL)`,
          ];
          for (const fixture of fixtures) {
            await tx.$executeRawUnsafe(fixture);
          }
          await tx.$executeRawUnsafe(`
            INSERT INTO ${schema}."AceFact" VALUES
              ('site', 'tenant-a', 'site-actor'),
              ('legacy', 'tenant-a', 'legacy-actor'),
              ('org', 'tenant-a', 'org-actor')
          `);
          await tx.$executeRawUnsafe(`
            DO $probe$
            DECLARE
              attempt record;
            BEGIN
              FOR attempt IN
                SELECT * FROM (VALUES
                  ('outsider', 'tenant-a', 'outsider'),
                  ('site-other-tenant', 'tenant-b', 'site-actor'),
                  ('org-other-tenant', 'tenant-b', 'org-actor'),
                  ('revoked', 'tenant-a', 'revoked-actor'),
                  ('expired', 'tenant-a', 'expired-actor'),
                  ('inactive-role', 'tenant-a', 'inactive-role-actor'),
                  ('inactive-permission', 'tenant-a', 'inactive-perm-actor'),
                  ('missing-actor', 'tenant-a', NULL)
                ) AS cases(id, tenant_id, actor_id)
              LOOP
                BEGIN
                  INSERT INTO ${schema}."AceFact"
                  VALUES (attempt.id, attempt.tenant_id, attempt.actor_id);
                  RAISE EXCEPTION 'Invalid actor accepted: %', attempt.id;
                EXCEPTION WHEN foreign_key_violation THEN
                  IF SQLERRM <> 'ACE record actor is not a member of the active tenant or organisation'
                  THEN RAISE; END IF;
                END;
              END LOOP;
            END $probe$
          `);

          const rows = await tx.$queryRawUnsafe<Array<{ count: bigint }>>(`
            SELECT count(*) AS count FROM ${schema}."AceFact"
          `);
          expect(rows).toEqual([{ count: 3n }]);
          throw rollback;
        },
        { timeout: 30_000 },
      ),
    ).rejects.toBe(rollback);
  });
});
