import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  getSystemRoleSeedTestAdminDatabaseUrl,
  provisionSystemRoleSeedTestRoles,
  SYSTEM_ROLE_SEED_TEST_DISPOSABLE_TOKEN,
} from "./system-role-seed-test-database";

const DISPOSABLE_ADMIN_URL =
  "postgresql://postgres:postgres@localhost:5433/pathway_system_role_seed_test_unit?schema=app";

describe("system-role seed proof environment guard", () => {
  it("does not fall back to the normal application DATABASE_URL", () => {
    expect(() =>
      getSystemRoleSeedTestAdminDatabaseUrl({
        DATABASE_URL:
          "postgresql://postgres:postgres@localhost:5433/pathway?schema=app",
      }),
    ).toThrow(/SYSTEM_ROLE_SEED_TEST_ADMIN_DATABASE_URL/);
  });

  it("rejects a normal database through the explicit admin variable", () => {
    expect(() =>
      getSystemRoleSeedTestAdminDatabaseUrl({
        SYSTEM_ROLE_SEED_TEST_ADMIN_DATABASE_URL:
          "postgresql://postgres:postgres@localhost:5433/pathway?schema=app",
        SYSTEM_ROLE_SEED_TEST_DISPOSABLE_TOKEN,
      }),
    ).toThrow(/disposable database name/i);
  });

  it("requires the explicit disposable-test acknowledgement", () => {
    expect(() =>
      getSystemRoleSeedTestAdminDatabaseUrl({
        SYSTEM_ROLE_SEED_TEST_ADMIN_DATABASE_URL: DISPOSABLE_ADMIN_URL,
      }),
    ).toThrow(/SYSTEM_ROLE_SEED_TEST_DISPOSABLE_TOKEN/);
  });

  it("accepts only the separately named disposable admin URL contract", () => {
    expect(
      getSystemRoleSeedTestAdminDatabaseUrl({
        SYSTEM_ROLE_SEED_TEST_ADMIN_DATABASE_URL: DISPOSABLE_ADMIN_URL,
        SYSTEM_ROLE_SEED_TEST_DISPOSABLE_TOKEN,
      }),
    ).toBe(DISPOSABLE_ADMIN_URL);
  });
});

const describeIfDb =
  process.env.PATHWAY_RUN_DB_INTEGRATION_TESTS === "1"
    ? describe
    : describe.skip;

interface RoleState {
  roleName: string;
  passwordHash: string | null;
  inheritsPrivileges: boolean;
  canCreateRoles: boolean;
  comment: string | null;
}

describeIfDb("system-role seed proof credential lifecycle", () => {
  let adminDatabaseUrl: string;
  let admin: PrismaClient | undefined;

  beforeAll(() => {
    adminDatabaseUrl = getSystemRoleSeedTestAdminDatabaseUrl(process.env);
    admin = new PrismaClient({
      datasources: { db: { url: adminDatabaseUrl } },
    });
  });

  afterAll(async () => {
    await admin?.$disconnect();
  });

  async function readCanonicalRole(): Promise<RoleState[]> {
    if (!admin) throw new Error("Test admin client is not initialised");
    return admin.$queryRawUnsafe<RoleState[]>(`
      SELECT
        roles.rolname AS "roleName",
        auth.rolpassword AS "passwordHash",
        roles.rolinherit AS "inheritsPrivileges",
        roles.rolcreaterole AS "canCreateRoles",
        shobj_description(roles.oid, 'pg_authid') AS "comment"
      FROM pg_roles roles
      JOIN pg_authid auth ON auth.oid = roles.oid
      WHERE roles.rolname = 'pathway_system_role_seed'
    `);
  }

  it("fails closed without mutating a pre-existing canonical login", async () => {
    if (!admin) throw new Error("Test admin client is not initialised");
    const password = randomBytes(32).toString("base64url");
    await admin.$executeRawUnsafe(`
      CREATE ROLE pathway_system_role_seed
        LOGIN INHERIT NOSUPERUSER NOBYPASSRLS
        NOCREATEDB CREATEROLE NOREPLICATION
        PASSWORD '${password}'
    `);
    await admin.$executeRawUnsafe(
      "COMMENT ON ROLE pathway_system_role_seed IS 'pre-existing-operational-role'",
    );

    try {
      const before = await readCanonicalRole();
      await expect(provisionSystemRoleSeedTestRoles()).rejects.toThrow(
        /already exists/i,
      );
      await expect(readCanonicalRole()).resolves.toEqual(before);
    } finally {
      await admin.$executeRawUnsafe("DROP ROLE pathway_system_role_seed");
    }
  });

  it("uses fresh credentials and removes every role it provisions", async () => {
    if (!admin) throw new Error("Test admin client is not initialised");
    const first = await provisionSystemRoleSeedTestRoles();
    const firstSeedPassword = new URL(first.seedUrl).password;
    const firstRuntimeRole = first.runtimeRoleName;

    await first.cleanup();
    await expect(
      admin.$queryRawUnsafe<Array<{ roleName: string }>>(
        `SELECT rolname AS "roleName"
         FROM pg_roles
         WHERE rolname IN (
           'pathway_system_role_seed',
           '${firstRuntimeRole}'
         )`,
      ),
    ).resolves.toEqual([]);

    const second = await provisionSystemRoleSeedTestRoles();
    try {
      expect(new URL(second.seedUrl).password).not.toBe(firstSeedPassword);
      expect(second.runtimeRoleName).not.toBe(firstRuntimeRole);
    } finally {
      await second.cleanup();
    }
  });
});
