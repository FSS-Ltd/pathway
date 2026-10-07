import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { prepareSupabaseBackupReplay } from "./prepare-supabase-backup-replay.mjs";

function fixture(databaseLines) {
  const sql = [
    String.raw`\restrict globals`,
    "CREATE ROLE postgres;",
    String.raw`\unrestrict globals`,
    String.raw`\connect template1`,
    "SET client_encoding = 'UTF8';",
    String.raw`\connect postgres`,
    String.raw`\restrict database`,
    ...databaseLines,
    String.raw`\unrestrict database`,
    "",
  ].join("\n");
  const archive = gzipSync(sql);
  const sha256 = createHash("sha256").update(archive).digest("hex");
  return { archive, sha256 };
}

const copy = ['COPY public."Org" (id) FROM stdin;', "org-1", String.raw`\.`];

test("keeps the database section and COPY data without cluster roles", () => {
  const { archive, sha256 } = fixture(copy);
  const result = prepareSupabaseBackupReplay(archive, {
    sha256,
    copySections: 1,
    dataRows: 1,
  });

  assert.equal(result.sections, 1);
  assert.equal(result.rows, 1);
  assert.match(result.replay, /COPY public\."Org"/);
  assert.doesNotMatch(result.replay, /CREATE ROLE|\\connect/);
});

test("rejects an archive with a different checksum", () => {
  const { archive } = fixture(copy);
  assert.throws(() => prepareSupabaseBackupReplay(archive), /checksum/);
});

test("rejects unexpected psql commands in the database section", () => {
  const { archive, sha256 } = fixture([...copy, String.raw`\! echo unsafe`]);
  assert.throws(
    () =>
      prepareSupabaseBackupReplay(archive, {
        sha256,
        copySections: 1,
        dataRows: 1,
      }),
    /Unexpected psql command/,
  );
});

test("rejects changed COPY row counts", () => {
  const { archive, sha256 } = fixture(copy);
  assert.throws(
    () =>
      prepareSupabaseBackupReplay(archive, {
        sha256,
        copySections: 1,
        dataRows: 2,
      }),
    /row counts differ/,
  );
});

test("rejects global role changes in the database section", () => {
  const { archive, sha256 } = fixture([
    ...copy,
    "ALTER ROLE postgres SUPERUSER;",
  ]);
  assert.throws(
    () =>
      prepareSupabaseBackupReplay(archive, {
        sha256,
        copySections: 1,
        dataRows: 1,
      }),
    /Global role change/,
  );
});

test("rejects an unfinished COPY section", () => {
  const { archive, sha256 } = fixture(copy.slice(0, -1));
  assert.throws(
    () =>
      prepareSupabaseBackupReplay(archive, {
        sha256,
        copySections: 1,
        dataRows: 1,
      }),
    /row counts differ/,
  );
});
