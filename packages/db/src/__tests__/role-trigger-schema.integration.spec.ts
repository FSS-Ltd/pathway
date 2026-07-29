import { randomUUID } from "node:crypto";
import type { PrismaClientType } from "../index";

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

const describeIfDb =
  process.env.PATHWAY_RUN_DB_INTEGRATION_TESTS === "1"
    ? describe
    : describe.skip;

describeIfDb("role trigger schema resolution", () => {
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

  it("validates a role revision in the active Prisma schema", async () => {
    const rollback = new Error("rollback role revision schema fixture");

    await expect(
      prisma.$transaction(async (tx) => {
        const schemas = await tx.$queryRaw<Array<{ schemaName: string }>>`
          SELECT current_schema() AS "schemaName"
        `;
        const schemaName = schemas[0]?.schemaName;
        if (!schemaName) {
          throw new Error(
            "Expected the database connection to select a schema",
          );
        }
        const qualifiedSchema = quoteIdentifier(schemaName);
        const actorUserId = randomUUID();
        const org = await tx.org.create({
          data: {
            id: randomUUID(),
            name: "Role revision schema",
            slug: `role-revision-schema-${randomUUID()}`,
            planCode: "trial",
          },
        });
        const role = await tx.orgRoleDefinition.create({
          data: {
            orgId: org.id,
            name: `Revision role ${randomUUID()}`,
            scope: "organisation",
            createdById: actorUserId,
            updatedById: actorUserId,
          },
        });

        await tx.$executeRawUnsafe("SET LOCAL search_path = ''");
        await tx.$executeRawUnsafe(
          `
          INSERT INTO ${qualifiedSchema}."OrgRoleRevision" (
            "id", "roleDefinitionId", "orgId", "tenantId", "version", "name",
            "description", "scope", "isActive", "permissionKeys", "actorUserId"
          ) VALUES (
            $1, $2, $3, NULL, $4, $5, NULL,
            'organisation'::${qualifiedSchema}."RoleScope", $6, '[]'::jsonb, $7
          )
          `,
          randomUUID(),
          role.id,
          org.id,
          role.version,
          role.name,
          role.isActive,
          actorUserId,
        );
        const revisions = await tx.$queryRawUnsafe<
          Array<{ roleDefinitionId: string }>
        >(
          `
          SELECT "roleDefinitionId"
          FROM ${qualifiedSchema}."OrgRoleRevision"
          WHERE "roleDefinitionId" = $1
          `,
          role.id,
        );

        expect(revisions).toEqual([{ roleDefinitionId: role.id }]);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it("validates a role assignment in the active Prisma schema", async () => {
    const rollback = new Error("rollback role assignment schema fixture");

    await expect(
      prisma.$transaction(async (tx) => {
        const org = await tx.org.create({
          data: {
            id: randomUUID(),
            name: "Role assignment schema",
            slug: `role-assignment-schema-${randomUUID()}`,
            planCode: "trial",
          },
        });
        const user = await tx.user.create({
          data: {
            id: randomUUID(),
            email: `${randomUUID()}@example.test`,
          },
        });
        await tx.orgMembership.create({
          data: {
            orgId: org.id,
            userId: user.id,
          },
        });
        const role = await tx.orgRoleDefinition.create({
          data: {
            orgId: org.id,
            name: `Assignment role ${randomUUID()}`,
            scope: "organisation",
            createdById: user.id,
            updatedById: user.id,
          },
        });

        const assignment = await tx.userRoleAssignment.create({
          data: {
            id: randomUUID(),
            orgId: org.id,
            userId: user.id,
            roleDefinitionId: role.id,
            assignedById: user.id,
          },
        });

        expect(assignment.roleDefinitionId).toBe(role.id);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });

  it("protects role permissions in the active Prisma schema", async () => {
    const rollback = new Error("rollback role permission schema fixture");

    await expect(
      prisma.$transaction(async (tx) => {
        const actorUserId = randomUUID();
        const org = await tx.org.create({
          data: {
            id: randomUUID(),
            name: "Role permission schema",
            slug: `role-permission-schema-${randomUUID()}`,
            planCode: "trial",
          },
        });
        const role = await tx.orgRoleDefinition.create({
          data: {
            orgId: org.id,
            name: `Permission role ${randomUUID()}`,
            scope: "organisation",
            createdById: actorUserId,
            updatedById: actorUserId,
          },
        });
        const permission = await tx.permissionDefinition.create({
          data: {
            key: `test.role.${randomUUID()}`,
            label: "Role trigger schema",
            description: "Exercises the role permission trigger schema.",
            scope: "organisation",
            sensitivity: "standard",
          },
        });

        const grant = await tx.orgRolePermission.create({
          data: {
            roleDefinitionId: role.id,
            permissionKey: permission.key,
            grantedById: actorUserId,
          },
        });

        expect(grant.roleDefinitionId).toBe(role.id);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
  });
});
