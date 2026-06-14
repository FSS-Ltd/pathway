#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import { getArgValue, parseEnvFile, resolveEnvFile } from "./lib/env-file.mjs";

const destination = path.resolve(
  process.cwd(),
  getArgValue("--output") ?? "env.production",
);
const overwrite = new Set(process.argv.slice(2)).has("--overwrite");
const NON_SECRET_DEFAULTS = {
  VERCEL_ORG_ID: "team_qvufVWPpOoZtQcAtRv8KQenE",
  SUPABASE_URL: "https://fkajodqkxysfcnfhizwn.supabase.co",
  SUPABASE_STORAGE_PRIVATE_BUCKET: "pathway-private",
  SUPABASE_STORAGE_PUBLIC_BUCKET: "pathway-public",
};
const GENERATED_INTERNAL_SECRET_KEYS = ["REVALIDATE_SECRET"];
const SUPABASE_POOLER_HOST = "aws-0-eu-west-1.pooler.supabase.com";

await main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[production-env] ${message}`);
  process.exit(1);
});

async function main() {
  if (fs.existsSync(destination) && !overwrite) {
    console.log(
      `[production-env] ${path.relative(
        process.cwd(),
        destination,
      )} already exists; pass --overwrite to replace it.`,
    );
    prepareEnvFile(destination);
    return;
  }

  const source = resolveEnvFile({
    explicit: getArgValue("--from"),
    candidates: [".env.production", ".env.prod"],
  });

  if (source === destination) {
    console.log(
      `[production-env] ${path.relative(process.cwd(), destination)} is already the selected source.`,
    );
    prepareEnvFile(destination);
    return;
  }

  fs.copyFileSync(source, destination);
  fs.chmodSync(destination, 0o600);
  console.log(
    `[production-env] Prepared ${path.relative(
      process.cwd(),
      destination,
    )} from ${path.relative(process.cwd(), source)}.`,
  );
  prepareEnvFile(destination);
}

function prepareEnvFile(filePath) {
  appendMissingNonSecretDefaults(filePath);
  appendMissingGeneratedSecrets(filePath);
  prepareSupabaseDatabaseUrls(filePath);
}

function appendMissingNonSecretDefaults(filePath) {
  const contents = fs.readFileSync(filePath, "utf8");
  const parsed = parseEnvFile(contents);
  const missing = Object.entries(NON_SECRET_DEFAULTS).filter(
    ([key]) => parsed[key] === undefined,
  );

  if (missing.length === 0) {
    console.log("[production-env] Known non-secret defaults are already set.");
    return;
  }

  const separator = contents.endsWith("\n") ? "" : "\n";
  const lines = missing.map(([key, value]) => `${key}=${value}`);
  fs.appendFileSync(
    filePath,
    `${separator}\n# ---- Non-secret deployment defaults ----\n${lines.join(
      "\n",
    )}\n`,
  );
  fs.chmodSync(filePath, 0o600);
  console.log(
    `[production-env] Added non-secret defaults: ${missing
      .map(([key]) => key)
      .join(", ")}.`,
  );
}

function appendMissingGeneratedSecrets(filePath) {
  const contents = fs.readFileSync(filePath, "utf8");
  const parsed = parseEnvFile(contents);
  const missing = GENERATED_INTERNAL_SECRET_KEYS.filter(
    (key) => parsed[key] === undefined,
  );

  if (missing.length === 0) {
    console.log("[production-env] Generated internal secrets are already set.");
    return;
  }

  const separator = contents.endsWith("\n") ? "" : "\n";
  const lines = missing.map((key) => `${key}=${generateSecret()}`);
  fs.appendFileSync(
    filePath,
    `${separator}\n# ---- Generated internal secrets ----\n${lines.join(
      "\n",
    )}\n`,
  );
  fs.chmodSync(filePath, 0o600);
  console.log(
    `[production-env] Added generated internal secrets: ${missing.join(", ")}.`,
  );
}

function generateSecret() {
  return crypto.randomBytes(32).toString("base64url");
}

function prepareSupabaseDatabaseUrls(filePath) {
  const contents = fs.readFileSync(filePath, "utf8");
  const parsed = parseEnvFile(contents);
  const updates = {};

  if (isDirectSupabaseDatabaseUrl(parsed.DATABASE_URL)) {
    updates.DATABASE_URL = buildSupabasePoolerUrl(
      parsed.DATABASE_URL,
      "transaction",
    );
  }

  if (
    parsed.DIRECT_URL === undefined &&
    isDirectSupabaseDatabaseUrl(parsed.DATABASE_URL)
  ) {
    updates.DIRECT_URL = buildSupabasePoolerUrl(parsed.DATABASE_URL, "session");
  } else if (isDirectSupabaseDatabaseUrl(parsed.DIRECT_URL)) {
    updates.DIRECT_URL = buildSupabasePoolerUrl(parsed.DIRECT_URL, "session");
  }

  if (Object.keys(updates).length === 0) {
    console.log(
      "[production-env] Supabase database URLs already use pooler-compatible hosts.",
    );
    return;
  }

  upsertEnvValues(filePath, updates, "Supabase pooler URLs");
  console.log(
    `[production-env] Updated Supabase database URLs: ${Object.keys(
      updates,
    ).join(", ")}.`,
  );
}

function buildSupabasePoolerUrl(value, mode) {
  const url = new URL(value);
  const ref = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i)?.[1];
  if (!ref) {
    throw new Error("Cannot derive Supabase project ref from database URL.");
  }

  url.username = `${url.username}.${ref}`;
  url.hostname = SUPABASE_POOLER_HOST;
  url.port = mode === "transaction" ? "6543" : "5432";
  if (mode === "transaction") {
    url.searchParams.set("pgbouncer", "true");
    url.searchParams.set("connection_limit", "1");
  }
  return url.toString();
}

function upsertEnvValues(filePath, updates, sectionTitle) {
  const keys = Object.keys(updates);
  const keyPattern = new RegExp(
    `^\\s*(${keys.map(escapeRegExp).join("|")})\\s*=`,
  );
  const contents = fs.readFileSync(filePath, "utf8");
  const retainedLines = contents
    .split(/\r?\n/)
    .filter((line) => !keyPattern.test(line));
  const nextContents = `${retainedLines.join("\n").replace(/\n*$/, "")}

# ---- ${sectionTitle} ----
${keys.map((key) => `${key}=${updates[key]}`).join("\n")}
`;
  fs.writeFileSync(filePath, nextContents);
  fs.chmodSync(filePath, 0o600);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isDirectSupabaseDatabaseUrl(value) {
  if (!value) return false;
  try {
    return (
      new URL(value).host.startsWith("db.") && value.includes(".supabase.co")
    );
  } catch {
    return false;
  }
}
