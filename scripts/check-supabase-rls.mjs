#!/usr/bin/env node
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { isPresent, loadEnvFile, resolveEnvFile } from "./lib/env-file.mjs";

const args = new Set(process.argv.slice(2));
const strict = args.has("--strict");
const envFile = resolveEnvFile();
const fileEnv = loadEnvFile(envFile);
const env = { ...fileEnv, ...process.env };
const databaseUrl = firstPresent(env.DIRECT_URL, env.DATABASE_URL);
const accepted = isTrue(env.SUPABASE_RLS_GATE_ACCEPTED);
const REQUIRED_RLS_TABLES = [
  "PermissionDefinition",
  "OrgRoleDefinition",
  "OrgRolePermission",
];

await main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[supabase-rls] ${message}`);
  process.exit(1);
});

async function main() {
  console.log(
    `[supabase-rls] source=${path.relative(process.cwd(), envFile)} mode=${
      strict ? "strict" : "dry-run"
    }`,
  );

  if (!isPresent(databaseUrl)) {
    const message =
      "DIRECT_URL or DATABASE_URL is required to check Supabase public-table RLS state.";
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
    const [disabledTables, publicRoleGrants, publicTables] = await Promise.all([
      prisma.$queryRaw`
      SELECT n.nspname AS schema_name, c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'p')
        AND c.relrowsecurity = false
      ORDER BY c.relname
    `,
      prisma.$queryRaw`
      SELECT
        tp.table_schema AS schema_name,
        tp.table_name,
        tp.grantee,
        string_agg(tp.privilege_type, ', ' ORDER BY tp.privilege_type) AS privileges
      FROM information_schema.table_privileges tp
      JOIN pg_namespace n ON n.nspname = tp.table_schema
      JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = tp.table_name
      WHERE tp.table_schema = 'public'
        AND c.relkind IN ('r', 'p')
        AND tp.grantee IN ('anon', 'authenticated')
      GROUP BY tp.table_schema, tp.table_name, tp.grantee
      ORDER BY tp.table_name, tp.grantee
    `,
      prisma.$queryRaw`
      SELECT c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind IN ('r', 'p')
      ORDER BY c.relname
    `,
    ]);

    const presentTables = new Set(
      publicTables.map((table) => table.table_name),
    );
    const missingRequiredTables = REQUIRED_RLS_TABLES.filter(
      (table) => !presentTables.has(table),
    );

    if (
      missingRequiredTables.length === 0 &&
      disabledTables.length === 0 &&
      publicRoleGrants.length === 0
    ) {
      console.log(
        "[supabase-rls] all public tables have RLS enabled and no anon/authenticated table grants.",
      );
      return;
    }

    if (missingRequiredTables.length > 0) {
      console.warn(
        `[supabase-rls] ${missingRequiredTables.length} required RLS tables are missing:`,
      );
      for (const tableName of missingRequiredTables) {
        console.warn(`[supabase-rls] - public.${tableName}`);
      }
    }

    if (disabledTables.length > 0) {
      console.warn(
        `[supabase-rls] ${disabledTables.length} public tables have RLS disabled:`,
      );
      for (const table of disabledTables) {
        console.warn(
          `[supabase-rls] - ${table.schema_name}.${table.table_name}`,
        );
      }
    }

    if (publicRoleGrants.length > 0) {
      console.warn(
        `[supabase-rls] ${publicRoleGrants.length} public table grants still expose anon/authenticated access:`,
      );
      for (const grant of publicRoleGrants) {
        console.warn(
          `[supabase-rls] - ${grant.schema_name}.${grant.table_name} -> ${grant.grantee} (${grant.privileges})`,
        );
      }
    }

    if (accepted && missingRequiredTables.length === 0) {
      console.warn(
        "[supabase-rls] SUPABASE_RLS_GATE_ACCEPTED=true; continuing because these public-table exposures have been explicitly accepted.",
      );
      return;
    }

    const message = [
      missingRequiredTables.length > 0
        ? "Required RLS tables are missing. Apply the current Prisma migrations before running the RLS gate."
        : undefined,
      disabledTables.length > 0 || publicRoleGrants.length > 0
        ? "Supabase public-table RLS gate failed. Enable RLS and remove anon/authenticated table grants, or remove the public schema from Data API exposure before setting SUPABASE_RLS_GATE_ACCEPTED=true."
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
