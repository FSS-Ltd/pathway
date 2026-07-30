import { config, DotenvConfigOptions } from "dotenv";
import path from "node:path";
import { execSync } from "node:child_process";

const CI_RLS_ROLE = "pathway_e2e_rls";
const CI_TENANT_RLS_ROLE = "pathway_e2e_tenant_rls";
const CI_OUTBOX_DENIED_ROLE = "pathway_e2e_outbox_denied";
const CI_AUDIT_DENIED_ROLE = "pathway_e2e_audit_denied";
const CI_BOOTSTRAP_ROLE = "pathway_test_user";

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe PostgreSQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

type RawStatementExecutor = (statement: string) => Promise<unknown>;

export async function configureCiRlsRole(
  executeStatement: RawStatementExecutor,
): Promise<void> {
  const bootstrapRole = quoteIdentifier(CI_BOOTSTRAP_ROLE);
  const statements = [
    ...roleProvisioningStatements(
      CI_RLS_ROLE,
      bootstrapRole,
      "SELECT, INSERT",
      "SELECT, INSERT",
    ),
    ...roleProvisioningStatements(
      CI_OUTBOX_DENIED_ROLE,
      bootstrapRole,
      "SELECT, INSERT",
      "SELECT",
    ),
    ...roleProvisioningStatements(
      CI_AUDIT_DENIED_ROLE,
      bootstrapRole,
      "SELECT",
      "SELECT, INSERT",
    ),
    ...tenantRoleProvisioningStatements(bootstrapRole),
  ];

  for (const statement of statements) {
    await executeStatement(statement);
  }
}

function tenantRoleProvisioningStatements(bootstrapRole: string): string[] {
  const tenantRlsRole = quoteIdentifier(CI_TENANT_RLS_ROLE);
  return [
    `
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${CI_TENANT_RLS_ROLE}') THEN
          CREATE ROLE ${tenantRlsRole} NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
        ELSE
          ALTER ROLE ${tenantRlsRole} NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
        END IF;
      END;
      $$;
    `,
    `REVOKE ALL PRIVILEGES ON SCHEMA app FROM ${tenantRlsRole};`,
    `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA app FROM ${tenantRlsRole};`,
    `GRANT USAGE ON SCHEMA app TO ${tenantRlsRole};`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO ${tenantRlsRole};`,
    `GRANT ${tenantRlsRole} TO ${bootstrapRole};`,
  ];
}

function roleProvisioningStatements(
  roleName: string,
  bootstrapRole: string,
  auditPrivileges: "SELECT" | "SELECT, INSERT",
  outboxPrivileges: "SELECT" | "SELECT, INSERT",
): string[] {
  const rlsRole = quoteIdentifier(roleName);
  return [
    `
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${roleName}') THEN
          CREATE ROLE ${rlsRole} NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
        ELSE
          ALTER ROLE ${rlsRole} NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT;
        END IF;
      END;
      $$;
    `,
    `REVOKE ALL PRIVILEGES ON SCHEMA app FROM ${rlsRole};`,
    `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA app FROM ${rlsRole};`,
    `GRANT USAGE ON SCHEMA app TO ${rlsRole};`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "OrgRoleDefinition" TO ${rlsRole};`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "OrgRolePermission" TO ${rlsRole};`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "UserRoleAssignment" TO ${rlsRole};`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "OrgRoleRevision" TO ${rlsRole};`,
    `GRANT ${auditPrivileges} ON TABLE "AuditEvent" TO ${rlsRole};`,
    `GRANT ${outboxPrivileges} ON TABLE "OutboxEvent" TO ${rlsRole};`,
    `GRANT SELECT ON TABLE "Tenant" TO ${rlsRole};`,
    `GRANT SELECT ON TABLE "PermissionDefinition" TO ${rlsRole};`,
    `GRANT SELECT ON TABLE "OrgMembership" TO ${rlsRole};`,
    `GRANT SELECT ON TABLE "OrgVertical" TO ${rlsRole};`,
    `GRANT SELECT ON TABLE "OrgModule" TO ${rlsRole};`,
    `GRANT ${rlsRole} TO ${bootstrapRole};`,
  ];
}

// Jest will call this once before running the e2e project
export default async function globalSetup(): Promise<void> {
  const usesGlobalSetup = process.env.E2E_USE_GLOBAL_SETUP === "true";
  if (!usesGlobalSetup) {
    return;
  }

  // 1) Load test env first, then fallback to root .env (quiet to suppress dotenv logs)
  config({
    path: path.resolve(__dirname, "../../.env.test"),
    override: !usesGlobalSetup,
    quiet: true,
  } as DotenvConfigOptions);
  config({
    path: path.resolve(__dirname, "../../.env"),
    override: false,
    quiet: true,
  } as DotenvConfigOptions);

  // 2) Point Prisma at the dedicated E2E database
  const bootstrapDatabaseUrl =
    process.env.E2E_BOOTSTRAP_DATABASE_URL ?? process.env.E2E_DATABASE_URL;
  if (!bootstrapDatabaseUrl) {
    throw new Error(
      "E2E_BOOTSTRAP_DATABASE_URL or E2E_DATABASE_URL is required for global E2E setup.",
    );
  }
  process.env.DATABASE_URL = bootstrapDatabaseUrl;

  // 3) Prepare schema ONCE per e2e run from reviewed migrations only.
  execSync(
    "pnpm --filter @pathway/db exec prisma migrate reset --force --skip-generate --skip-seed",
    {
      stdio: "inherit",
      env: {
        ...process.env,
        PRISMA_IGNORE_ENV_FILE: "1",
        DATABASE_URL: process.env.DATABASE_URL!,
      },
    },
  );

  execSync("pnpm --filter @pathway/db exec prisma migrate deploy", {
    stdio: "inherit",
    env: {
      ...process.env,
      PRISMA_IGNORE_ENV_FILE: "1",
      DATABASE_URL: process.env.DATABASE_URL!,
    },
  });

  // Seed platform metadata and tenants before the CI-only role drops privileges.
  const { closePrisma, prisma, runTransaction } = await import("@pathway/db");
  try {
    const { syncPermissionDefinitions } = await import("@pathway/platform");
    await runTransaction(syncPermissionDefinitions);

    const org = await prisma.org.upsert({
      where: { slug: "e2e-org" },
      update: { name: "E2E Org" },
      create: {
        id: process.env.E2E_ORG_ID,
        slug: "e2e-org",
        name: "E2E Org",
        planCode: "trial",
        isSuite: false,
      },
    });
    process.env.E2E_ORG_ID = org.id;
    const tenantA = await prisma.tenant.upsert({
      where: { slug: "tenant-a-e2e" },
      update: { name: "Tenant A (e2e)" },
      create: {
        id: process.env.E2E_TENANT_ID,
        slug: "tenant-a-e2e",
        name: "Tenant A (e2e)",
        org: { connect: { id: org.id } },
      },
    });
    const tenantB = await prisma.tenant.upsert({
      where: { slug: "tenant-b-e2e" },
      update: { name: "Tenant B (e2e)" },
      create: {
        id: process.env.E2E_TENANT2_ID,
        slug: "tenant-b-e2e",
        name: "Tenant B (e2e)",
        org: { connect: { id: org.id } },
      },
    });
    process.env.E2E_TENANT_ID = tenantA.id;
    process.env.E2E_TENANT2_ID = tenantB.id;

    await configureCiRlsRole((statement) =>
      prisma.$executeRawUnsafe(statement),
    );
  } finally {
    await closePrisma();
  }
}
