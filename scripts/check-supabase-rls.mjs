#!/usr/bin/env node
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { URL } from "node:url";
import { isPresent, loadEnvFile, resolveEnvFile } from "./lib/env-file.mjs";
import {
  findRequiredTableEntries,
  findUnreviewedRolePolicies,
} from "./lib/role-rls-gate.mjs";

const args = new Set(process.argv.slice(2));
const strict = args.has("--strict");
const envFile = resolveRlsEnvFile();
const fileEnv = envFile ? loadEnvFile(envFile) : {};
const env = { ...fileEnv, ...process.env };
const databaseUrl = firstPresent(env.E2E_DATABASE_URL, env.DIRECT_URL, env.DATABASE_URL);
const databaseSchema = databaseUrl ? schemaFromDatabaseUrl(databaseUrl) : undefined;
const accepted = isTrue(env.SUPABASE_RLS_GATE_ACCEPTED);
const REQUIRED_RLS_TABLES = [
  "PermissionDefinition",
  "OrgRoleDefinition",
  "OrgRolePermission",
  "OrgRoleRevision",
  "UserRoleAssignment",
  "AuditEvent",
  "OutboxEvent",
];
await main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[supabase-rls] ${message}`);
  process.exit(1);
});

async function main() {
  console.log(
    `[supabase-rls] source=${envFile ? path.relative(process.cwd(), envFile) : "process environment"} mode=${
      strict ? "strict" : "dry-run"
    }`,
  );

  if (!isPresent(databaseUrl) || !databaseSchema) {
    const message =
      "E2E_DATABASE_URL, DIRECT_URL, or DATABASE_URL is required to check the configured schema RLS state.";
    if (strict) throw new Error(message);
    console.warn(`[supabase-rls] warning: ${message}`);
    return;
  }

  const { PrismaClient } = createRequire(
    path.resolve(process.cwd(), "packages/db/package.json"),
  )("@prisma/client");
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    const queries = await Promise.all([
      prisma.$queryRawUnsafe(`
      SELECT n.nspname AS schema_name, c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1
        AND c.relkind IN ('r', 'p')
        AND c.relforcerowsecurity = false
        AND c.relname IN ('PermissionDefinition', 'OrgRoleDefinition', 'OrgRolePermission', 'OrgRoleRevision', 'UserRoleAssignment', 'AuditEvent', 'OutboxEvent')
      ORDER BY c.relname
    `, databaseSchema),
      prisma.$queryRawUnsafe(`
      SELECT n.nspname AS schema_name, c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1
        AND c.relkind IN ('r', 'p')
        AND c.relrowsecurity = false
      ORDER BY c.relname
    `, databaseSchema),
      prisma.$queryRawUnsafe(`
      SELECT
        tp.table_schema AS schema_name,
        tp.table_name,
        tp.grantee,
        string_agg(tp.privilege_type, ', ' ORDER BY tp.privilege_type) AS privileges
      FROM information_schema.table_privileges tp
      JOIN pg_namespace n ON n.nspname = tp.table_schema
      JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = tp.table_name
      WHERE tp.table_schema = $1
        AND c.relkind IN ('r', 'p')
        AND tp.grantee IN ('PUBLIC', 'anon', 'authenticated')
      GROUP BY tp.table_schema, tp.table_name, tp.grantee
      ORDER BY tp.table_name, tp.grantee
    `, databaseSchema),
      prisma.$queryRawUnsafe(`
      SELECT c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1
        AND c.relkind IN ('r', 'p')
      ORDER BY c.relname
    `, databaseSchema),
      prisma.$queryRawUnsafe(`
      SELECT c.relname AS table_name, p.polname AS policy_name, p.polcmd AS command,
        p.polpermissive AS permissive,
        ARRAY(
          SELECT CASE WHEN role_oid = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(role_oid) END
          FROM unnest(p.polroles) AS role_oid
          ORDER BY 1
        ) AS roles,
        pg_get_expr(p.polqual, p.polrelid) AS using_qualifier,
        pg_get_expr(p.polwithcheck, p.polrelid) AS check_qualifier
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1
        AND c.relname IN ('PermissionDefinition', 'OrgRoleDefinition', 'OrgRolePermission', 'OrgRoleRevision', 'UserRoleAssignment', 'AuditEvent', 'OutboxEvent')
      ORDER BY c.relname, p.polname
    `, databaseSchema),
    ]);
    const [unforcedTables, disabledTables, publicRoleGrants, publicTables, policies] = queries;

    const presentTables = new Set(
      publicTables.map((table) => table.table_name),
    );
    const missingRequiredTables = REQUIRED_RLS_TABLES.filter(
      (table) => !presentTables.has(table),
    );
    const unreviewedRolePolicies = findUnreviewedRolePolicies(policies);
    const disabledRequiredTables = findRequiredTableEntries(
      disabledTables,
      REQUIRED_RLS_TABLES,
    );
    const requiredPublicRoleGrants = findRequiredTableEntries(
      publicRoleGrants,
      REQUIRED_RLS_TABLES,
    );

    if (
      missingRequiredTables.length === 0 &&
      disabledTables.length === 0 &&
      unforcedTables.length === 0 &&
      unreviewedRolePolicies.length === 0 &&
      publicRoleGrants.length === 0
    ) {
      console.log(
        `[supabase-rls] all ${databaseSchema} tables have RLS enabled and no PUBLIC/anon/authenticated table grants.`,
      );
      return;
    }

    if (missingRequiredTables.length > 0) {
      console.warn(
        `[supabase-rls] ${missingRequiredTables.length} required RLS tables are missing:`,
      );
      for (const tableName of missingRequiredTables) {
        console.warn(`[supabase-rls] - ${databaseSchema}.${tableName}`);
      }
    }

    if (disabledTables.length > 0) {
      console.warn(
        `[supabase-rls] ${disabledTables.length} ${databaseSchema} tables have RLS disabled:`,
      );
      for (const table of disabledTables) {
        console.warn(
          `[supabase-rls] - ${table.schema_name}.${table.table_name}`,
        );
      }
    }

    if (unforcedTables.length > 0) {
      console.warn(`[supabase-rls] ${unforcedTables.length} required tables do not force RLS:`);
      for (const table of unforcedTables) {
        console.warn(`[supabase-rls] - ${table.schema_name}.${table.table_name}`);
      }
    }

    if (unreviewedRolePolicies.length > 0) {
      console.warn(
        `[supabase-rls] unreviewed required-table RLS policies: ${unreviewedRolePolicies.join(", ")}`,
      );
    }

    if (publicRoleGrants.length > 0) {
      console.warn(
        `[supabase-rls] ${publicRoleGrants.length} ${databaseSchema} table grants still expose PUBLIC, anon, or authenticated access:`,
      );
      for (const grant of publicRoleGrants) {
        console.warn(
          `[supabase-rls] - ${grant.schema_name}.${grant.table_name} -> ${grant.grantee} (${grant.privileges})`,
        );
      }
    }

    if (
      accepted &&
      missingRequiredTables.length === 0 &&
      disabledRequiredTables.length === 0 &&
      unforcedTables.length === 0 &&
      unreviewedRolePolicies.length === 0 &&
      requiredPublicRoleGrants.length === 0
    ) {
      console.warn(
        "[supabase-rls] SUPABASE_RLS_GATE_ACCEPTED=true; continuing because public-table exposure was accepted while required role RLS remains enforced.",
      );
      return;
    }

    const message = [
      missingRequiredTables.length > 0
        ? "Required RLS tables are missing. Apply the current Prisma migrations before running the RLS gate."
        : undefined,
      disabledTables.length > 0 || publicRoleGrants.length > 0
        ? "Supabase RLS gate failed. Enable RLS and remove PUBLIC, anon, or authenticated table grants, or remove the configured schema from Data API exposure before setting SUPABASE_RLS_GATE_ACCEPTED=true."
        : undefined,
      unforcedTables.length > 0 || unreviewedRolePolicies.length > 0
        ? "Required ACE access-control tables must force RLS and retain only their reviewed policies."
        : undefined,
    ]
      .filter(Boolean)
      .join(" ");
    if (strict) throw new Error(message);
    console.warn(`[supabase-rls] warning: ${message}`);
  } finally {
    await prisma.$disconnect();
  }
}

function firstPresent(...values) {
  return values.find((value) => isPresent(value));
}

function isTrue(value) {
  return ["1", "true", "yes"].includes(String(value ?? "").toLowerCase());
}

function resolveRlsEnvFile() {
  try {
    return resolveEnvFile();
  } catch (error) {
    if (isPresent(process.env.E2E_DATABASE_URL)) {
      return undefined;
    }
    throw error;
  }
}

function schemaFromDatabaseUrl(url) {
  const schema = new URL(url).searchParams.get("schema");
  if (schema !== "app") {
    throw new Error("The RLS gate requires a database URL with schema=app.");
  }
  return "app";
}
