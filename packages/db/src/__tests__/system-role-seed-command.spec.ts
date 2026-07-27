import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import type { PrismaClientType } from "../index";

const describeIfSeedProof =
  process.env.PATHWAY_RUN_DB_SEED_PROOF === "1" ? describe : describe.skip;

const REPOSITORY_ROOT = path.resolve(__dirname, "../../../..");

describeIfSeedProof("pnpm db:seed system-role orchestration", () => {
  let prisma: PrismaClientType;
  let orgId: string;

  beforeAll(async () => {
    const hostname = new URL(process.env.DATABASE_URL ?? "").hostname;
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      throw new Error(
        `Refusing to run system-role seed proof against "${hostname}"`,
      );
    }
    prisma = (await import("../index")).prisma;
  });

  beforeEach(async () => {
    const org = await prisma.org.create({
      data: {
        id: randomUUID(),
        name: "System role seed proof",
        slug: `system-role-seed-proof-${randomUUID()}`,
        planCode: "trial",
        orgVertical: { create: { vertical: "ACE_SCHOOL" } },
        tenants: {
          create: {
            id: randomUUID(),
            name: "ACE proof site",
            slug: `ace-proof-site-${randomUUID()}`,
          },
        },
      },
    });
    orgId = org.id;
    await prisma.orgRoleDefinition.create({
      data: {
        id: `custom-role:${org.id}`,
        orgId: org.id,
        name: "Custom Staff Clone",
        scope: "organisation",
        isSystem: false,
        createdById: randomUUID(),
        updatedById: randomUUID(),
      },
    });
    await prisma.permissionDefinition.deleteMany({
      where: { key: "ace.behaviour.read" },
    });
  });

  afterEach(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        "SELECT set_config('app.system_role_seed', 'on', true)",
      );
      await tx.orgRoleDefinition.deleteMany({ where: { orgId } });
    });
    await prisma.tenant.deleteMany({ where: { orgId } });
    await prisma.orgVertical.deleteMany({ where: { orgId } });
    await prisma.org.delete({ where: { id: orgId } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function runDatabaseSeed(): void {
    const result = spawnSync("pnpm", ["db:seed"], {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
      env: process.env,
    });
    if (result.status !== 0) {
      throw new Error(
        `pnpm db:seed failed:\n${result.stdout}\n${result.stderr}`,
      );
    }
  }

  it("syncs registry metadata before idempotently seeding every template without touching custom roles", async () => {
    runDatabaseSeed();

    const rolesAfterFirstRun = await prisma.orgRoleDefinition.findMany({
      where: { orgId },
      select: {
        id: true,
        name: true,
        tenantId: true,
        isSystem: true,
        permissions: {
          select: { permissionKey: true },
          orderBy: { permissionKey: "asc" },
        },
      },
      orderBy: { id: "asc" },
    });
    expect(rolesAfterFirstRun).toHaveLength(8);
    expect(
      rolesAfterFirstRun
        .filter(({ isSystem }) => isSystem)
        .map(({ name }) => name)
        .sort(),
    ).toEqual([
      "Finance Operator",
      "Organisation Head",
      "Parent",
      "Safeguarding Lead",
      "Site Lead",
      "Staff",
      "Student",
    ]);
    expect(
      rolesAfterFirstRun.find(({ name }) => name === "Safeguarding Lead")
        ?.permissions,
    ).toEqual([{ permissionKey: "ace.behaviour.read" }]);
    expect(
      rolesAfterFirstRun.find(({ name }) => name === "Finance Operator")
        ?.permissions,
    ).toEqual([]);
    expect(
      rolesAfterFirstRun.find(({ name }) => name === "Custom Staff Clone"),
    ).toMatchObject({ isSystem: false, permissions: [] });

    runDatabaseSeed();

    await expect(
      prisma.orgRoleDefinition.findMany({
        where: { orgId },
        select: {
          id: true,
          name: true,
          tenantId: true,
          isSystem: true,
          permissions: {
            select: { permissionKey: true },
            orderBy: { permissionKey: "asc" },
          },
        },
        orderBy: { id: "asc" },
      }),
    ).resolves.toEqual(rolesAfterFirstRun);
    await expect(
      prisma.permissionDefinition.findUnique({
        where: { key: "ace.behaviour.read" },
        select: { isActive: true },
      }),
    ).resolves.toEqual({ isActive: true });
  });
});
