import assert from "node:assert/strict";
import test from "node:test";
import { validatePrismaMigrationUrl } from "./validate-prisma-migration-url.mjs";

const projectRef = "testproject123";
const supabaseUrl = `https://${projectRef}.supabase.co`;

test("accepts the configured project's direct migration endpoint", () => {
  const url = `postgresql://postgres:secret@db.${projectRef}.supabase.co:5432/postgres`;
  assert.equal(validatePrismaMigrationUrl(url, supabaseUrl), "direct");
});

test("accepts the configured project's shared session pooler", () => {
  const url = `postgresql://postgres.${projectRef}:secret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`;
  assert.equal(validatePrismaMigrationUrl(url, supabaseUrl), "session-pooler");
});

test("rejects a connection to a different Supabase project", () => {
  const url =
    "postgresql://postgres:secret@db.otherproject.supabase.co:5432/postgres";
  assert.throws(
    () => validatePrismaMigrationUrl(url, supabaseUrl),
    /different Supabase projects/,
  );
});

test("rejects transaction-pooler URLs", () => {
  const url = `postgresql://postgres.${projectRef}:secret@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`;
  assert.throws(
    () => validatePrismaMigrationUrl(url, supabaseUrl),
    /port 5432/,
  );
});

test("rejects a session-pooler user for a different project", () => {
  const url =
    "postgresql://postgres.otherproject:secret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres";
  assert.throws(
    () => validatePrismaMigrationUrl(url, supabaseUrl),
    /different Supabase projects/,
  );
});

test("rejects a missing migration password", () => {
  const url = `postgresql://postgres@db.${projectRef}.supabase.co:5432/postgres`;
  assert.throws(
    () => validatePrismaMigrationUrl(url, supabaseUrl),
    /database password/,
  );
});

test("rejects a direct URL using a different database role", () => {
  const url = `postgresql://app_user:secret@db.${projectRef}.supabase.co:5432/postgres`;
  assert.throws(
    () => validatePrismaMigrationUrl(url, supabaseUrl),
    /postgres database role/,
  );
});
