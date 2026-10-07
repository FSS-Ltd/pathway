#!/usr/bin/env node
import { createHash } from "node:crypto";
import { open, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { TextDecoder } from "node:util";
import { gunzipSync } from "node:zlib";

export const BACKUP_SHA256 =
  "2dc22e100b0778d470ccb73f1c668978d604ad87bbcdf596de9617de2e449c6a";

export function prepareSupabaseBackupReplay(
  archive,
  { sha256 = BACKUP_SHA256, copySections = 166, dataRows = 1820 } = {},
) {
  const actualHash = createHash("sha256").update(archive).digest("hex");
  if (actualHash !== sha256) {
    throw new Error(
      "Database archive checksum does not match the reviewed backup.",
    );
  }

  const source = new TextDecoder("utf-8", { fatal: true }).decode(
    gunzipSync(archive),
  );
  const markers = [...source.matchAll(/^\\connect postgres\r?\n/gm)];
  if (markers.length !== 1 || !/^\\connect template1\r?$/m.test(source)) {
    throw new Error(
      "Expected one postgres and one template1 connection section.",
    );
  }

  const replay = source.slice(markers[0].index + markers[0][0].length);
  let sections = 0;
  let rows = 0;
  let inCopy = false;

  for (const line of replay.split(/\r?\n/)) {
    if (inCopy) {
      if (line === "\\.") inCopy = false;
      else rows += 1;
      continue;
    }

    if (/^COPY .+ FROM stdin;$/.test(line)) {
      sections += 1;
      inCopy = true;
    } else if (line.startsWith("\\")) {
      if (!/^\\(?:restrict|unrestrict)\s+\S+$/.test(line)) {
        throw new Error("Unexpected psql command in the database section.");
      }
    } else if (/^(?:CREATE|ALTER|DROP) ROLE\b/i.test(line)) {
      throw new Error("Global role change found in the database section.");
    }
  }

  if (inCopy || sections !== copySections || rows !== dataRows) {
    throw new Error(
      "Database COPY sections or row counts differ from the manifest.",
    );
  }

  return { replay, sections, rows, sha256: actualHash };
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  try {
    if (process.argv.length !== 3) {
      throw new Error(
        "Usage: node scripts/prepare-supabase-backup-replay.mjs <backup.gz>",
      );
    }
    const result = prepareSupabaseBackupReplay(await readFile(process.argv[2]));
    const directory = await mkdtemp(
      path.join(tmpdir(), "pathway-supabase-replay-"),
    );
    const output = path.join(directory, "postgres.sql");
    const file = await open(output, "wx", 0o600);
    try {
      await file.writeFile(result.replay, "utf8");
    } finally {
      await file.close();
    }
    console.log(output);
    console.log(
      `Verified ${result.sections} COPY sections and ${result.rows} rows.`,
    );
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "Could not prepare the backup replay.",
    );
    process.exitCode = 1;
  }
}
