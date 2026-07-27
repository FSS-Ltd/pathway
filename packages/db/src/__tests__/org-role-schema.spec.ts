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

describe("organisation role schema contract", () => {
  it("declares organisation role definitions backed by platform permission keys", () => {
    expect(schema).toContain("enum RoleScope");
    expect(schema).toContain("model OrgRoleDefinition");
    expect(schema).toContain("model OrgRolePermission");
    expect(schema).toMatch(/permissionKey\s+String/);
    expect(schema).toMatch(
      /permission\s+PermissionDefinition\s+@relation\(fields: \[permissionKey\], references: \[key\]\)/,
    );
  });

  it("requires active role metadata to be isolated by organisation and site", () => {
    expect(schema).toContain("@@unique([id, orgId])");
    expect(schema).toContain("@@unique([orgId, tenantId, name])");
    expect(schema).toContain("@@index([orgId, tenantId, isActive])");
    expect(schema).toMatch(
      /tenant\s+Tenant\?\s+@relation\(fields: \[tenantId, orgId\], references: \[id, orgId\]\)/,
    );
  });

  it("makes missing organisation role tables a strict RLS gate failure", () => {
    expect(rlsGate).toContain('"OrgRoleDefinition"');
    expect(rlsGate).toContain('"OrgRolePermission"');
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
});
