import { randomUUID } from "node:crypto";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  deleteSystemRoleSeedTestOrganisation,
  provisionSystemRoleSeedTestRoles,
  type ProvisionedSystemRoleSeedTestRoles,
} from "./system-role-seed-test-database";

const describeIfSeedProof =
  process.env.PATHWAY_RUN_DB_SEED_PROOF === "1" ? describe : describe.skip;

const REPOSITORY_ROOT = path.resolve(__dirname, "../../../..");
const APPROVED_GRANTS = {
  "Organisation Head": [
    "ace.behaviour.policy.manage",
    "ace.behaviour.read",
    "ace.behaviour.record",
    "ace.community.moderate",
    "ace.community.read",
    "ace.community.report",
    "ace.community.settings.manage",
    "ace.community.spaces.manage",
    "ace.dashboard.read",
    "ace.faith.manage",
    "ace.faith.publish",
    "ace.faith.read",
    "ace.pace.correct",
    "ace.pace.diagnostics.manage",
    "ace.pace.diagnostics.read",
    "ace.pace.inventory.manage",
    "ace.pace.inventory.read",
    "ace.pace.override",
    "ace.pace.read",
    "ace.pace.record",
    "ace.reports.publish",
    "ace.reports.read",
    "ace.reports.review",
    "ace.settings.manage",
    "ace.settings.read",
    "attendance.manage",
    "attendance.read",
    "classes.manage",
    "messaging.conversations.create",
    "messaging.conversations.read",
    "messaging.messages.read",
    "messaging.messages.send",
    "notices.manage",
    "notices.publish",
    "notices.read",
    "parents.read",
    "platform.access.assignments.manage",
    "platform.access.assignments.read",
    "platform.access.audit.read",
    "platform.access.permissions.read",
    "platform.access.roles.manage",
    "platform.access.roles.read",
    "platform.access.users.read",
    "reports.read",
    "safeguarding.concerns.manage",
    "safeguarding.concerns.read",
    "school.permission_slips.manage",
    "school.permission_slips.read",
    "school.trips.manage",
    "school.trips.read",
    "students.manage",
  ],
  "Site Lead": [
    "ace.behaviour.policy.manage",
    "ace.behaviour.read",
    "ace.behaviour.record",
    "ace.community.moderate",
    "ace.community.read",
    "ace.community.report",
    "ace.community.spaces.manage",
    "ace.dashboard.read",
    "ace.faith.manage",
    "ace.faith.publish",
    "ace.faith.read",
    "ace.pace.correct",
    "ace.pace.diagnostics.manage",
    "ace.pace.diagnostics.read",
    "ace.pace.inventory.manage",
    "ace.pace.inventory.read",
    "ace.pace.override",
    "ace.pace.read",
    "ace.pace.record",
    "ace.reports.compile",
    "ace.reports.publish",
    "ace.reports.read",
    "ace.reports.review",
    "ace.settings.manage",
    "ace.settings.read",
    "attendance.manage",
    "attendance.read",
    "classes.manage",
    "messaging.conversations.create",
    "messaging.conversations.read",
    "messaging.messages.read",
    "messaging.messages.send",
    "notices.manage",
    "notices.publish",
    "notices.read",
    "parents.read",
    "reports.read",
    "safeguarding.concerns.record",
    "school.permission_slips.manage",
    "school.permission_slips.read",
    "school.trips.manage",
    "school.trips.read",
    "students.manage",
  ],
  Staff: [
    "ace.behaviour.read",
    "ace.behaviour.record",
    "ace.community.post",
    "ace.community.read",
    "ace.community.report",
    "ace.faith.manage",
    "ace.faith.read",
    "ace.pace.read",
    "ace.pace.record",
    "ace.reports.compile",
    "ace.reports.read",
    "ace.reports.review",
    "ace.settings.read",
    "attendance.manage",
    "attendance.read",
    "messaging.conversations.create",
    "messaging.conversations.read",
    "messaging.messages.read",
    "messaging.messages.send",
    "notices.read",
    "safeguarding.concerns.record",
    "school.permission_slips.manage",
    "school.permission_slips.read",
    "school.trips.manage",
    "school.trips.read",
  ],
  "Safeguarding Lead": [
    "ace.behaviour.read",
    "attendance.read",
    "notices.read",
    "safeguarding.concerns.manage",
    "safeguarding.concerns.read",
    "safeguarding.concerns.record",
  ],
  "Finance Operator": [],
  Parent: [
    "ace.faith.read",
    "ace.faith.reflect",
    "ace.parent.progress.read",
    "messaging.conversations.create",
    "messaging.conversations.read",
    "messaging.messages.read",
    "messaging.messages.send",
    "school.permission_slips.read",
    "school.permission_slips.respond",
  ],
  Student: [
    "ace.community.post",
    "ace.community.read",
    "ace.community.report",
    "ace.faith.read",
    "ace.faith.reflect",
    "ace.student.self.read",
    "messaging.conversations.read",
    "messaging.messages.read",
    "messaging.messages.send",
  ],
} as const;

describeIfSeedProof("system-role seed command orchestration", () => {
  let prisma: PrismaClient;
  let orgId: string;
  let seedUrl: string;
  let runtimeUrl: string;
  let testRoles: ProvisionedSystemRoleSeedTestRoles | undefined;

  beforeAll(async () => {
    testRoles = await provisionSystemRoleSeedTestRoles();
    ({ seedUrl, runtimeUrl } = testRoles);
    prisma = new PrismaClient({
      datasources: { db: { url: testRoles.adminDatabaseUrl } },
    });
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
        name: "Organisation Head",
        scope: "organisation",
        isSystem: false,
        version: 7,
        createdById: randomUUID(),
        updatedById: randomUUID(),
      },
    });
    await prisma.permissionDefinition.upsert({
      where: { key: "ace.behaviour.read" },
      update: { isActive: false },
      create: {
        key: "ace.behaviour.read",
        label: "View behaviour",
        description: "View behaviour records and policy",
        scope: "site",
        sensitivity: "sensitive",
        delegable: true,
        requiredVertical: "ACE_SCHOOL",
        isActive: false,
      },
    });
  });

  afterEach(async () => {
    await deleteSystemRoleSeedTestOrganisation(prisma, orgId);
  });

  afterAll(async () => {
    try {
      await prisma?.$disconnect();
    } finally {
      await testRoles?.cleanup();
    }
  });

  function runSeed(
    command: string[],
    systemRoleSeedDatabaseUrl: string | undefined,
  ): SpawnSyncReturns<string> {
    const env = { ...process.env };
    delete env.SYSTEM_ROLE_SEED_DATABASE_URL;
    if (systemRoleSeedDatabaseUrl) {
      env.SYSTEM_ROLE_SEED_DATABASE_URL = systemRoleSeedDatabaseUrl;
    }
    env.DATABASE_URL = testRoles?.adminDatabaseUrl ?? "";
    return spawnSync("pnpm", command, {
      cwd: REPOSITORY_ROOT,
      encoding: "utf8",
      env,
    });
  }

  function expectSeedSuccess(result: SpawnSyncReturns<string>): void {
    expect({
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    }).toEqual({
      status: 0,
      stdout: expect.any(String),
      stderr: expect.any(String),
    });
  }

  it("fails closed before registry sync when the dedicated URL is absent or has the wrong identity", async () => {
    const missingUrl = runSeed(["db:seed"], undefined);
    expect(missingUrl.status).not.toBe(0);
    expect(`${missingUrl.stdout}\n${missingUrl.stderr}`).toMatch(
      /SYSTEM_ROLE_SEED_DATABASE_URL/,
    );
    await expect(
      prisma.permissionDefinition.findUnique({
        where: { key: "ace.behaviour.read" },
      }),
    ).resolves.toMatchObject({ isActive: false });

    const wrongIdentity = runSeed(["db:seed"], runtimeUrl);
    expect(wrongIdentity.status).not.toBe(0);
    expect(`${wrongIdentity.stdout}\n${wrongIdentity.stderr}`).toMatch(
      /pathway_system_role_seed/,
    );
    await expect(
      prisma.permissionDefinition.findUnique({
        where: { key: "ace.behaviour.read" },
      }),
    ).resolves.toMatchObject({ isActive: false });
  });

  it("syncs metadata, preserves a colliding custom clone, and leaves every approved template byte-stable on rerun", async () => {
    expectSeedSuccess(runSeed(["db:seed"], seedUrl));

    const selectRoleState = () =>
      prisma.orgRoleDefinition.findMany({
        where: { orgId },
        select: {
          id: true,
          name: true,
          tenantId: true,
          scope: true,
          isSystem: true,
          isActive: true,
          version: true,
          createdById: true,
          updatedById: true,
          createdAt: true,
          updatedAt: true,
          permissions: {
            select: {
              permissionKey: true,
              grantedById: true,
              grantedAt: true,
            },
            orderBy: { permissionKey: "asc" as const },
          },
        },
        orderBy: { id: "asc" as const },
      });
    const rolesAfterFirstRun = await selectRoleState();
    const systemRoles = rolesAfterFirstRun.filter(({ isSystem }) => isSystem);

    expect(rolesAfterFirstRun).toHaveLength(8);
    expect(
      rolesAfterFirstRun.filter(({ name }) => name === "Organisation Head"),
    ).toHaveLength(2);
    expect(rolesAfterFirstRun.find(({ isSystem }) => !isSystem)).toMatchObject({
      name: "Organisation Head",
      isSystem: false,
      version: 7,
    });
    expect(systemRoles).toHaveLength(7);
    for (const role of systemRoles) {
      expect(role).toMatchObject({
        isActive: true,
        version: 1,
        createdById: "00000000-0000-0000-0000-000000000000",
        updatedById: "00000000-0000-0000-0000-000000000000",
      });
      expect(
        role.permissions.map(({ permissionKey }) => permissionKey),
      ).toEqual(APPROVED_GRANTS[role.name as keyof typeof APPROVED_GRANTS]);
      expect(
        role.permissions.every(
          ({ grantedById }) =>
            grantedById === "00000000-0000-0000-0000-000000000000",
        ),
      ).toBe(true);
    }
    await expect(
      prisma.userRoleAssignment.count({ where: { orgId } }),
    ).resolves.toBe(0);

    expectSeedSuccess(runSeed(["--filter", "@pathway/db", "seed"], seedUrl));
    expectSeedSuccess(
      runSeed(
        ["--filter", "@pathway/db", "exec", "prisma", "db", "seed"],
        seedUrl,
      ),
    );
    await expect(selectRoleState()).resolves.toEqual(rolesAfterFirstRun);
    await expect(
      prisma.permissionDefinition.findUnique({
        where: { key: "ace.behaviour.read" },
        select: { isActive: true },
      }),
    ).resolves.toEqual({ isActive: true });
  }, 30_000);
});
