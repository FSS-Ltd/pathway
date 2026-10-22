#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DISPOSABLE_TOKEN = "finance-backup-restore-disposable-databases";
const SOURCE_DATABASE = "pathway_finance_backup_source";
const TARGET_DATABASE = "pathway_finance_backup_target";
const FIXTURE_ORG_ID = "00000000-0000-0000-0000-000000000071";
const FIXTURE_TENANT_ID = "00000000-0000-0000-0000-000000000072";
const FIXTURE_PROFILE_ID = "00000000-0000-0000-0000-000000000073";
const FIXTURE_LEGAL_ENTITY = "Synthetic Finance Backup Fixture";

export function resolveFinanceBackupRestoreUrls({
  sourceUrl,
  targetUrl,
  nodeEnv,
  disposableToken,
}) {
  if (nodeEnv !== "test" || disposableToken !== DISPOSABLE_TOKEN) {
    throw new Error(
      "Finance backup restore smoke requires the explicit disposable test guard.",
    );
  }

  const source = parseLocalDatabaseUrl(sourceUrl, SOURCE_DATABASE);
  const target = parseLocalDatabaseUrl(targetUrl, TARGET_DATABASE);
  if (
    source.hostname !== target.hostname ||
    source.port !== target.port ||
    source.username !== target.username ||
    source.password !== target.password
  ) {
    throw new Error(
      "Finance backup restore source and target must use one local PostgreSQL service.",
    );
  }

  source.searchParams.delete("schema");
  target.searchParams.delete("schema");
  return { sourceUrl: source.toString(), targetUrl: target.toString() };
}

function parseLocalDatabaseUrl(value, expectedDatabase) {
  if (!value) {
    throw new Error("Finance backup restore database URL is required.");
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Finance backup restore database URL is invalid.");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname) ||
    decodeURIComponent(url.pathname.slice(1)) !== expectedDatabase
  ) {
    throw new Error(
      `Finance backup restore only accepts the local ${expectedDatabase} database.`,
    );
  }
  return url;
}

function run(command, args, stage, archiveDirectory) {
  const clientImage =
    process.env.FINANCE_BACKUP_RESTORE_PG_CLIENT_IMAGE?.trim();
  const archivePath = archiveDirectory
    ? path.join(archiveDirectory, "finance.backup")
    : undefined;
  const executable = clientImage ? "docker" : command;
  const commandArgs = clientImage
    ? [
        "run",
        "--rm",
        "--network=host",
        ...(archiveDirectory
          ? ["-v", `${archiveDirectory}:/finance-backup`]
          : []),
        clientImage,
        command,
        ...args.map((argument) =>
          argument === archivePath
            ? "/finance-backup/finance.backup"
            : argument,
        ),
      ]
    : args;
  try {
    return execFileSync(executable, commandArgs, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    throw new Error(`Finance backup restore smoke failed during ${stage}.`);
  }
}

function assertOutput(actual, expected, message) {
  if (actual !== expected) throw new Error(message);
}

function main() {
  const { sourceUrl, targetUrl } = resolveFinanceBackupRestoreUrls({
    sourceUrl: process.env.FINANCE_BACKUP_RESTORE_SOURCE_DATABASE_URL,
    targetUrl: process.env.FINANCE_BACKUP_RESTORE_TARGET_DATABASE_URL,
    nodeEnv: process.env.NODE_ENV,
    disposableToken: process.env.FINANCE_BACKUP_RESTORE_DISPOSABLE_TOKEN,
  });
  const targetUserObjectCount = run(
    "psql",
    [
      "--no-psqlrc",
      "--set=ON_ERROR_STOP=1",
      "--tuples-only",
      "--no-align",
      "--dbname",
      targetUrl,
      "--command",
      "SELECT count(*) FROM pg_namespace AS schema_info WHERE schema_info.nspname !~ '^pg_' AND schema_info.nspname <> 'information_schema' AND (schema_info.nspname <> 'public' OR EXISTS (SELECT 1 FROM pg_class AS relation_info WHERE relation_info.relnamespace = schema_info.oid) OR EXISTS (SELECT 1 FROM pg_proc AS routine_info WHERE routine_info.pronamespace = schema_info.oid) OR EXISTS (SELECT 1 FROM pg_type AS type_info WHERE type_info.typnamespace = schema_info.oid AND type_info.typtype <> 'b'))",
    ],
    "checking the target database",
  );
  assertOutput(
    targetUserObjectCount,
    "0",
    "Finance backup restore target must be empty before restore.",
  );

  const seedSql = `
    INSERT INTO app."Org" ("id", "name", "slug", "planCode", "createdAt", "updatedAt")
    VALUES ('${FIXTURE_ORG_ID}', 'Finance Backup Fixture', 'finance-backup-restore-fixture', 'starter', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    INSERT INTO app."Tenant" ("id", "name", "slug", "orgId")
    VALUES ('${FIXTURE_TENANT_ID}', 'Finance Backup Fixture', 'finance-backup-restore-fixture', '${FIXTURE_ORG_ID}');
    INSERT INTO app."FinanceProfile" ("id", "orgId", "tenantId", "legalEntityName", "createdAt", "updatedAt")
    VALUES ('${FIXTURE_PROFILE_ID}', '${FIXTURE_ORG_ID}', '${FIXTURE_TENANT_ID}', '${FIXTURE_LEGAL_ENTITY}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
  `;
  run(
    "psql",
    [
      "--no-psqlrc",
      "--set=ON_ERROR_STOP=1",
      "--dbname",
      sourceUrl,
      "--command",
      seedSql,
    ],
    "seeding the synthetic Finance profile",
  );

  const directory = mkdtempSync(
    path.join(os.tmpdir(), "finance-backup-restore-"),
  );
  const archivePath = path.join(directory, "finance.backup");
  try {
    run(
      "pg_dump",
      [
        "--format=custom",
        "--no-owner",
        "--no-acl",
        "--file",
        archivePath,
        sourceUrl,
      ],
      "creating the source archive",
      directory,
    );
    run(
      "pg_restore",
      [
        "--exit-on-error",
        "--single-transaction",
        "--no-owner",
        "--no-acl",
        "--dbname",
        targetUrl,
        archivePath,
      ],
      "restoring the archive",
      directory,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }

  const restoredProfile = run(
    "psql",
    [
      "--no-psqlrc",
      "--set=ON_ERROR_STOP=1",
      "--tuples-only",
      "--no-align",
      "--dbname",
      targetUrl,
      "--command",
      `SELECT profile."legalEntityName" || '|' || (table_info.relrowsecurity AND table_info.relforcerowsecurity)::text FROM app."FinanceProfile" AS profile JOIN pg_class AS table_info ON table_info.oid = 'app."FinanceProfile"'::regclass WHERE profile."id" = '${FIXTURE_PROFILE_ID}'`,
    ],
    "verifying restored Finance data and RLS",
  );
  assertOutput(
    restoredProfile,
    `${FIXTURE_LEGAL_ENTITY}|true`,
    "Restored Finance profile or forced RLS state did not match the source.",
  );
  console.log(
    "Verified a synthetic Finance profile and forced RLS after PostgreSQL archive restore.",
  );
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  try {
    main();
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "Finance backup restore smoke failed.",
    );
    process.exitCode = 1;
  }
}
