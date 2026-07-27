import { PrismaClient } from "@prisma/client";

export const SYSTEM_ROLE_SEED_TEST_PASSWORD =
  "PathwaySystemRoleSeedTestPassword1!";
export const SYSTEM_ROLE_RUNTIME_TEST_ROLE = "pathway_system_role_runtime_test";
export const SYSTEM_ROLE_RUNTIME_TEST_PASSWORD =
  "PathwaySystemRoleRuntimeTestPassword1!";

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
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

export async function provisionSystemRoleSeedTestRoles(
  databaseUrl: string,
): Promise<{ runtimeUrl: string; seedUrl: string }> {
  const parsedUrl = new URL(databaseUrl);
  const databaseName = decodeURIComponent(parsedUrl.pathname.slice(1));
  if (!databaseName) {
    throw new Error("System-role seed tests require a database name");
  }

  const admin = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
  try {
    await admin.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_roles WHERE rolname = 'pathway_system_role_seed'
        ) THEN
          CREATE ROLE pathway_system_role_seed
            LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS
            NOCREATEDB NOCREATEROLE NOREPLICATION
            PASSWORD '${SYSTEM_ROLE_SEED_TEST_PASSWORD}';
        ELSE
          ALTER ROLE pathway_system_role_seed
            LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS
            NOCREATEDB NOCREATEROLE NOREPLICATION
            PASSWORD '${SYSTEM_ROLE_SEED_TEST_PASSWORD}';
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_roles
          WHERE rolname = '${SYSTEM_ROLE_RUNTIME_TEST_ROLE}'
        ) THEN
          CREATE ROLE ${SYSTEM_ROLE_RUNTIME_TEST_ROLE}
            LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS
            NOCREATEDB NOCREATEROLE NOREPLICATION
            PASSWORD '${SYSTEM_ROLE_RUNTIME_TEST_PASSWORD}';
        ELSE
          ALTER ROLE ${SYSTEM_ROLE_RUNTIME_TEST_ROLE}
            LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS
            NOCREATEDB NOCREATEROLE NOREPLICATION
            PASSWORD '${SYSTEM_ROLE_RUNTIME_TEST_PASSWORD}';
        END IF;
      END;
      $$;
    `);
    await admin.$executeRawUnsafe(
      `REVOKE pathway_system_role_seed FROM ${SYSTEM_ROLE_RUNTIME_TEST_ROLE}`,
    );
    await admin.$executeRawUnsafe(
      `GRANT CONNECT ON DATABASE ${quoteIdentifier(databaseName)}
       TO pathway_system_role_seed, ${SYSTEM_ROLE_RUNTIME_TEST_ROLE}`,
    );
    await admin.$executeRawUnsafe(`
      GRANT USAGE ON SCHEMA app
      TO pathway_system_role_seed, ${SYSTEM_ROLE_RUNTIME_TEST_ROLE}
    `);
    await admin.$executeRawUnsafe(`
      GRANT SELECT ON TABLE
        app."Org",
        app."Tenant",
        app."OrgVertical",
        app."OrgModule",
        app."PermissionDefinition",
        app."OrgRoleDefinition",
        app."OrgRolePermission"
      TO pathway_system_role_seed, ${SYSTEM_ROLE_RUNTIME_TEST_ROLE}
    `);
    await admin.$executeRawUnsafe(`
      GRANT INSERT, UPDATE, DELETE ON TABLE
        app."PermissionDefinition",
        app."OrgRoleDefinition",
        app."OrgRolePermission"
      TO pathway_system_role_seed
    `);
    await admin.$executeRawUnsafe(`
      GRANT INSERT, UPDATE, DELETE ON TABLE
        app."OrgRoleDefinition",
        app."OrgRolePermission"
      TO ${SYSTEM_ROLE_RUNTIME_TEST_ROLE}
    `);
  } finally {
    await admin.$disconnect();
  }

  return {
    runtimeUrl: connectionUrlForRole(
      databaseUrl,
      SYSTEM_ROLE_RUNTIME_TEST_ROLE,
      SYSTEM_ROLE_RUNTIME_TEST_PASSWORD,
    ),
    seedUrl: connectionUrlForRole(
      databaseUrl,
      "pathway_system_role_seed",
      SYSTEM_ROLE_SEED_TEST_PASSWORD,
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
