#!/usr/bin/env node
import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function validatePrismaMigrationUrl(databaseUrl, supabaseUrl) {
  if (!databaseUrl?.trim()) {
    throw new Error(
      "DIRECT_URL is required for production database migrations.",
    );
  }

  let connection;
  try {
    connection = new URL(databaseUrl);
  } catch {
    throw new Error("DIRECT_URL must be a valid PostgreSQL connection URL.");
  }

  if (!new Set(["postgres:", "postgresql:"]).has(connection.protocol)) {
    throw new Error("DIRECT_URL must use the PostgreSQL protocol.");
  }
  if (connection.port && connection.port !== "5432") {
    throw new Error(
      "DIRECT_URL must use port 5432; transaction-pooler URLs cannot run migrations.",
    );
  }
  if (!connection.password) {
    throw new Error("DIRECT_URL must include the database password.");
  }

  const projectRef = parseSupabaseProjectRef(supabaseUrl);
  const directProjectRef = connection.hostname.match(
    /^db\.([a-z0-9]+)\.supabase\.co$/i,
  )?.[1];
  if (directProjectRef) {
    if (decodeURIComponent(connection.username) !== "postgres") {
      throw new Error(
        "Direct migration URLs must use the postgres database role.",
      );
    }
    if (directProjectRef.toLowerCase() !== projectRef) {
      throw new Error(
        "DIRECT_URL and SUPABASE_URL point at different Supabase projects.",
      );
    }
    return "direct";
  }

  const isSharedPooler = /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/i.test(
    connection.hostname,
  );
  if (isSharedPooler) {
    const poolerUser = decodeURIComponent(connection.username);
    const poolerProjectRef = poolerUser.match(/^postgres\.([a-z0-9]+)$/i)?.[1];
    if (!poolerProjectRef) {
      throw new Error(
        "Session-pooler migration URLs must use the postgres.<project-ref> role.",
      );
    }
    if (poolerProjectRef.toLowerCase() !== projectRef) {
      throw new Error(
        "DIRECT_URL and SUPABASE_URL point at different Supabase projects.",
      );
    }
    return "session-pooler";
  }

  throw new Error(
    "DIRECT_URL must use the Supabase direct endpoint or shared session pooler.",
  );
}

function parseSupabaseProjectRef(supabaseUrl) {
  if (!supabaseUrl?.trim()) {
    throw new Error(
      "SUPABASE_URL is required to validate the migration target.",
    );
  }
  let projectUrl;
  try {
    projectUrl = new URL(supabaseUrl);
  } catch {
    throw new Error("SUPABASE_URL must be a valid Supabase project URL.");
  }
  const projectRef = projectUrl.hostname.match(
    /^([a-z0-9]+)\.supabase\.co$/i,
  )?.[1];
  if (!projectRef) {
    throw new Error("SUPABASE_URL must identify a Supabase project host.");
  }
  return projectRef.toLowerCase();
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  try {
    const mode = validatePrismaMigrationUrl(
      process.env.DATABASE_URL,
      process.env.SUPABASE_URL,
    );
    console.log(
      `[migration-url] Valid ${mode} endpoint for the configured project.`,
    );
  } catch (error) {
    console.error(
      `[migration-url] ${error instanceof Error ? error.message : "Invalid database URL."}`,
    );
    process.exitCode = 1;
  }
}
