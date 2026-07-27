import { randomBytes } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";

const SYSTEM_ROLE_SEED_ROLE = "pathway_system_role_seed";
const SYSTEM_ROLE_RUNTIME_TEST_ROLE_PREFIX =
  "pathway_system_role_runtime_test_";
const DISPOSABLE_DATABASE_NAME =
  /^pathway_system_role_seed_test(?:_[a-z0-9][a-z0-9_]*)?$/;
const TEST_ROLE_COMMENT_PREFIX = "pathway-system-role-seed-test:";
const PROVISIONING_LOCK_KEY = "pathway-system-role-seed-test-provision";

export const SYSTEM_ROLE_SEED_TEST_DISPOSABLE_TOKEN =
  "provision-and-drop-system-role-seed-test-logins";

export interface ProvisionedSystemRoleSeedTestRoles {
  readonly adminDatabaseUrl: string;
  readonly runtimeRoleName: string;
  readonly runtimeUrl: string;
  readonly seedUrl: string;
  cleanup(): Promise<void>;
}

interface TestRoleOwnership {
  roleName: string;
  comment: string | null;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function databaseNameFromUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  return decodeURIComponent(url.pathname.slice(1));
}

function connectionUrlForRole(
  databaseUrl: string,
  role: string,
  password: string,
): string {
  const url = new URL(databaseUrl);
  url.username = role;
  url.password = password;
  return url.toString();
}

export function getSystemRoleSeedTestAdminDatabaseUrl(
  environment: NodeJS.ProcessEnv,
): string {
  const databaseUrl =
    environment.SYSTEM_ROLE_SEED_TEST_ADMIN_DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error(
      "SYSTEM_ROLE_SEED_TEST_ADMIN_DATABASE_URL is required; the proof never falls back to DATABASE_URL",
    );
  }

  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error(
      "SYSTEM_ROLE_SEED_TEST_ADMIN_DATABASE_URL must be a valid PostgreSQL URL",
    );
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error(
      "SYSTEM_ROLE_SEED_TEST_ADMIN_DATABASE_URL must be a PostgreSQL URL",
    );
  }

  const databaseName = databaseNameFromUrl(databaseUrl);
  if (!DISPOSABLE_DATABASE_NAME.test(databaseName)) {
    throw new Error(
      `System-role seed proof requires a disposable database name matching "${DISPOSABLE_DATABASE_NAME.source}"`,
    );
  }
  if (url.searchParams.get("schema") !== "app") {
    throw new Error(
      "SYSTEM_ROLE_SEED_TEST_ADMIN_DATABASE_URL must select the app schema",
    );
  }
  if (
    environment.SYSTEM_ROLE_SEED_TEST_DISPOSABLE_TOKEN !==
    SYSTEM_ROLE_SEED_TEST_DISPOSABLE_TOKEN
  ) {
    throw new Error(
      "SYSTEM_ROLE_SEED_TEST_DISPOSABLE_TOKEN must explicitly acknowledge the disposable test environment",
    );
  }

  return databaseUrl;
}

async function readTestRoleOwnership(
  tx: Prisma.TransactionClient,
  runtimeRoleName: string,
): Promise<TestRoleOwnership[]> {
  return tx.$queryRawUnsafe<TestRoleOwnership[]>(`
    SELECT
      rolname AS "roleName",
      shobj_description(oid, 'pg_authid') AS "comment"
    FROM pg_roles
    WHERE rolname IN (
      ${quoteLiteral(SYSTEM_ROLE_SEED_ROLE)},
      ${quoteLiteral(runtimeRoleName)}
    )
    ORDER BY rolname
  `);
}

async function cleanupProvisionedTestRoles(
  adminDatabaseUrl: string,
  databaseName: string,
  runtimeRoleName: string,
  ownershipMarker: string,
): Promise<void> {
  const admin = new PrismaClient({
    datasources: { db: { url: adminDatabaseUrl } },
  });
  try {
    await admin.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(hashtext(${quoteLiteral(PROVISIONING_LOCK_KEY)}))`,
      );
      const roles = await readTestRoleOwnership(tx, runtimeRoleName);
      const unownedRole = roles.find(
        ({ comment }) => comment !== ownershipMarker,
      );
      if (unownedRole) {
        throw new Error(
          `Refusing to clean up unowned PostgreSQL role ${unownedRole.roleName}`,
        );
      }
      if (roles.length === 0) return;

      const roleList = roles
        .map(({ roleName }) => quoteIdentifier(roleName))
        .join(", ");
      await tx.$executeRawUnsafe(
        `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA app FROM ${roleList}`,
      );
      await tx.$executeRawUnsafe(
        `REVOKE ALL PRIVILEGES ON SCHEMA app FROM ${roleList}`,
      );
      await tx.$executeRawUnsafe(
        `REVOKE ALL PRIVILEGES ON DATABASE ${quoteIdentifier(databaseName)} FROM ${roleList}`,
      );
      await tx.$executeRawUnsafe(`DROP ROLE ${roleList}`);
    });
  } finally {
    await admin.$disconnect();
  }
}

export async function provisionSystemRoleSeedTestRoles(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<ProvisionedSystemRoleSeedTestRoles> {
  const adminDatabaseUrl = getSystemRoleSeedTestAdminDatabaseUrl(environment);
  const databaseName = databaseNameFromUrl(adminDatabaseUrl);
  const runtimeRoleName = `${SYSTEM_ROLE_RUNTIME_TEST_ROLE_PREFIX}${randomBytes(8).toString("hex")}`;
  const seedPassword = randomBytes(32).toString("base64url");
  const runtimePassword = randomBytes(32).toString("base64url");
  const ownershipMarker = `${TEST_ROLE_COMMENT_PREFIX}${randomBytes(16).toString("hex")}`;
  const admin = new PrismaClient({
    datasources: { db: { url: adminDatabaseUrl } },
  });

  try {
    await admin.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(hashtext(${quoteLiteral(PROVISIONING_LOCK_KEY)}))`,
      );
      const existingRoles = await readTestRoleOwnership(tx, runtimeRoleName);
      if (existingRoles.length > 0) {
        throw new Error(
          `${existingRoles[0]?.roleName ?? SYSTEM_ROLE_SEED_ROLE} already exists; refusing to alter a pre-existing PostgreSQL login`,
        );
      }

      await tx.$executeRawUnsafe(`
        CREATE ROLE ${quoteIdentifier(SYSTEM_ROLE_SEED_ROLE)}
          LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS
          NOCREATEDB NOCREATEROLE NOREPLICATION
          PASSWORD ${quoteLiteral(seedPassword)}
      `);
      await tx.$executeRawUnsafe(`
        CREATE ROLE ${quoteIdentifier(runtimeRoleName)}
          LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS
          NOCREATEDB NOCREATEROLE NOREPLICATION
          PASSWORD ${quoteLiteral(runtimePassword)}
      `);
      await tx.$executeRawUnsafe(
        `COMMENT ON ROLE ${quoteIdentifier(SYSTEM_ROLE_SEED_ROLE)} IS ${quoteLiteral(ownershipMarker)}`,
      );
      await tx.$executeRawUnsafe(
        `COMMENT ON ROLE ${quoteIdentifier(runtimeRoleName)} IS ${quoteLiteral(ownershipMarker)}`,
      );
      await tx.$executeRawUnsafe(
        `GRANT CONNECT ON DATABASE ${quoteIdentifier(databaseName)}
         TO ${quoteIdentifier(SYSTEM_ROLE_SEED_ROLE)}, ${quoteIdentifier(runtimeRoleName)}`,
      );
      await tx.$executeRawUnsafe(`
        GRANT USAGE ON SCHEMA app
        TO ${quoteIdentifier(SYSTEM_ROLE_SEED_ROLE)}, ${quoteIdentifier(runtimeRoleName)}
      `);
      await tx.$executeRawUnsafe(`
        GRANT SELECT ON TABLE
          app."Org",
          app."Tenant",
          app."OrgVertical",
          app."OrgModule",
          app."PermissionDefinition",
          app."OrgRoleDefinition",
          app."OrgRolePermission"
        TO ${quoteIdentifier(SYSTEM_ROLE_SEED_ROLE)}, ${quoteIdentifier(runtimeRoleName)}
      `);
      await tx.$executeRawUnsafe(`
        GRANT INSERT, UPDATE, DELETE ON TABLE
          app."PermissionDefinition",
          app."OrgRoleDefinition",
          app."OrgRolePermission"
        TO ${quoteIdentifier(SYSTEM_ROLE_SEED_ROLE)}
      `);
      await tx.$executeRawUnsafe(`
        GRANT INSERT, UPDATE, DELETE ON TABLE
          app."OrgRoleDefinition",
          app."OrgRolePermission"
        TO ${quoteIdentifier(runtimeRoleName)}
      `);
    });
  } finally {
    await admin.$disconnect();
  }

  return {
    adminDatabaseUrl,
    runtimeRoleName,
    runtimeUrl: connectionUrlForRole(
      adminDatabaseUrl,
      runtimeRoleName,
      runtimePassword,
    ),
    seedUrl: connectionUrlForRole(
      adminDatabaseUrl,
      SYSTEM_ROLE_SEED_ROLE,
      seedPassword,
    ),
    cleanup: () =>
      cleanupProvisionedTestRoles(
        adminDatabaseUrl,
        databaseName,
        runtimeRoleName,
        ownershipMarker,
      ),
  };
}

export async function deleteSystemRoleSeedTestOrganisation(
  admin: PrismaClient,
  orgId: string,
): Promise<void> {
  await admin.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL session_replication_role = replica");
    await tx.orgRoleDefinition.deleteMany({ where: { orgId } });
  });
  await admin.tenant.deleteMany({ where: { orgId } });
  await admin.orgVertical.deleteMany({ where: { orgId } });
  await admin.orgModule.deleteMany({ where: { orgId } });
  await admin.org.deleteMany({ where: { id: orgId } });
}
