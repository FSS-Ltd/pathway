import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseEnvFile } from "./lib/env-file.mjs";
import { validatePrismaMigrationUrl } from "./validate-prisma-migration-url.mjs";

const script = fileURLToPath(
  new URL("./prepare-production-env.mjs", import.meta.url),
);
const targetRef = "jzofykdzpuslpdyfovxp";
const sourceRef = "fkajodqkxysfcnfhizwn";
const targetPooler = "aws-0-eu-west-2.pooler.supabase.com";
const directUrl = `postgresql://postgres:fixture-password@db.${targetRef}.supabase.co:5432/postgres?schema=app`;

function fixture(t, lines) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "pathway-production-env-"),
  );
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const source = path.join(directory, "source.env");
  const output = path.join(directory, "output.env");
  fs.writeFileSync(source, `${lines.join("\n")}\n`, { mode: 0o600 });
  return { source, output };
}

function prepare({ source, output }, overwrite = false) {
  return spawnSync(
    process.execPath,
    [
      script,
      "--from",
      source,
      "--output",
      output,
      ...(overwrite ? ["--overwrite"] : []),
    ],
    { encoding: "utf8" },
  );
}

test("uses the selected project's URL and explicit pooler host", (t) => {
  const files = fixture(t, [
    `DATABASE_URL=${directUrl}`,
    `SUPABASE_POOLER_HOST=${targetPooler}`,
  ]);

  const result = prepare(files);

  assert.equal(result.status, 0, result.stderr);
  const env = parseEnvFile(fs.readFileSync(files.output, "utf8"));
  const runtime = new URL(env.DATABASE_URL);
  const migration = new URL(env.DIRECT_URL);
  assert.equal(env.SUPABASE_URL, `https://${targetRef}.supabase.co`);
  assert.equal(runtime.hostname, targetPooler);
  assert.equal(runtime.port, "6543");
  assert.equal(decodeURIComponent(runtime.username), `postgres.${targetRef}`);
  assert.equal(runtime.searchParams.get("pgbouncer"), "true");
  assert.equal(migration.hostname, targetPooler);
  assert.equal(migration.port, "5432");
  assert.equal(
    validatePrismaMigrationUrl(env.DIRECT_URL, env.SUPABASE_URL),
    "session-pooler",
  );
  assert.equal(fs.statSync(files.output).mode & 0o777, 0o600);
  const prepared = fs.readFileSync(files.output, "utf8");
  assert.equal(prepare(files).status, 0);
  assert.equal(fs.readFileSync(files.output, "utf8"), prepared);
});

test("can use a matching existing session pooler URL for conversion", (t) => {
  const files = fixture(t, [
    `DATABASE_URL=${directUrl}`,
    `DIRECT_URL=postgresql://postgres.${targetRef}:fixture-password@${targetPooler}:5432/postgres?schema=app`,
  ]);

  const result = prepare(files);

  assert.equal(result.status, 0, result.stderr);
  const env = parseEnvFile(fs.readFileSync(files.output, "utf8"));
  assert.equal(new URL(env.DATABASE_URL).hostname, targetPooler);
  assert.equal(new URL(env.DIRECT_URL).hostname, targetPooler);
});

test("derives runtime and migration URLs from a session pooler source", (t) => {
  const files = fixture(t, [
    `DATABASE_URL=postgresql://postgres.${targetRef}:fixture-password@${targetPooler}:5432/postgres?schema=app&pgbouncer=true&connection_limit=1`,
  ]);

  const result = prepare(files);

  assert.equal(result.status, 0, result.stderr);
  const env = parseEnvFile(fs.readFileSync(files.output, "utf8"));
  const runtime = new URL(env.DATABASE_URL);
  const migration = new URL(env.DIRECT_URL);
  assert.equal(env.SUPABASE_URL, `https://${targetRef}.supabase.co`);
  assert.equal(runtime.hostname, targetPooler);
  assert.equal(runtime.port, "6543");
  assert.equal(runtime.searchParams.get("pgbouncer"), "true");
  assert.equal(migration.hostname, targetPooler);
  assert.equal(migration.port, "5432");
  assert.equal(migration.searchParams.has("pgbouncer"), false);
  assert.equal(migration.searchParams.has("connection_limit"), false);
  assert.equal(
    validatePrismaMigrationUrl(env.DIRECT_URL, env.SUPABASE_URL),
    "session-pooler",
  );
});

test("removes transaction options from an existing session migration URL", (t) => {
  const sessionUrl = `postgresql://postgres.${targetRef}:fixture-password@${targetPooler}:5432/postgres?schema=app&pgbouncer=true&connection_limit=1`;
  const files = fixture(t, [
    `DATABASE_URL=${sessionUrl}`,
    `DIRECT_URL=${sessionUrl}`,
  ]);

  const result = prepare(files);

  assert.equal(result.status, 0, result.stderr);
  const env = parseEnvFile(fs.readFileSync(files.output, "utf8"));
  const migration = new URL(env.DIRECT_URL);
  assert.equal(migration.port, "5432");
  assert.equal(migration.searchParams.has("pgbouncer"), false);
  assert.equal(migration.searchParams.has("connection_limit"), false);
});

test("rejects a migration URL for another project", (t) => {
  const files = fixture(t, [
    `DATABASE_URL=${directUrl}`,
    `DIRECT_URL=postgresql://postgres.${sourceRef}:fixture-password@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`,
  ]);

  const result = prepare(files);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /different Supabase projects/);
  assert.equal(fs.existsSync(files.output), false);
});

test("rejects a different Supabase project before overwriting output", (t) => {
  const files = fixture(t, [
    `DATABASE_URL=${directUrl}`,
    `SUPABASE_POOLER_HOST=${targetPooler}`,
    `SUPABASE_URL=https://${sourceRef}.supabase.co`,
  ]);
  fs.writeFileSync(files.output, "KEEP=existing\n", { mode: 0o600 });

  const result = prepare(files, true);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /different Supabase projects/);
  assert.equal(fs.readFileSync(files.output, "utf8"), "KEEP=existing\n");
});

test("rejects a direct URL without a configured pooler host", (t) => {
  const files = fixture(t, [`DATABASE_URL=${directUrl}`]);

  const result = prepare(files);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /pooler host/);
  assert.equal(fs.existsSync(files.output), false);
});
