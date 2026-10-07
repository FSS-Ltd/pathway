#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

const SOURCE_REF = "fkajodqkxysfcnfhizwn";
const TARGET_REF = "jzofykdzpuslpdyfovxp";
const ARCHIVE_SHA256 =
  "699c1303bfe03202b97735aafbb11ba8c8bb4bf1ea8606d64a134cb3c4127756";
const BUCKETS = new Set(["pathway-public", "pathway-private"]);
const TARGET_URL = `https://${TARGET_REF}.supabase.co`;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function parseArchiveEntries(listing, expectedCount = 32) {
  const names = listing.trimEnd().split("\n");
  if (names.length !== expectedCount || new Set(names).size !== names.length) {
    throw new Error(
      "Storage archive entry count or uniqueness differs from the manifest.",
    );
  }

  return names.map((archivePath) => {
    const [project, bucket, ...parts] = archivePath.split("/");
    if (
      project !== SOURCE_REF ||
      !BUCKETS.has(bucket) ||
      parts.length === 0 ||
      parts.some(
        (part) => !part || part === "." || part === ".." || part.includes("\\"),
      )
    ) {
      throw new Error("Storage archive contains an unexpected object path.");
    }
    const key = parts.join("/");
    const extension = path.extname(key).toLowerCase();
    const contentType = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
    }[extension];
    if (!contentType)
      throw new Error("Storage archive has an unsupported content type.");
    return { archivePath, bucket, key, contentType };
  });
}

function objectUrl({ bucket, key }) {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return `${TARGET_URL}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedKey}`;
}

export async function uploadAndVerify(
  object,
  bytes,
  secretKey,
  request = globalThis.fetch,
) {
  const url = objectUrl(object);
  const headers = { apikey: secretKey, Authorization: `Bearer ${secretKey}` };
  const uploaded = await request(url, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": object.contentType,
      "x-upsert": "true",
    },
    body: new Uint8Array(bytes),
  });
  if (!uploaded.ok)
    throw new Error(`Storage upload returned HTTP ${uploaded.status}.`);

  const downloaded = await request(url, { method: "GET", headers });
  if (!downloaded.ok)
    throw new Error(`Storage download returned HTTP ${downloaded.status}.`);
  const received = Buffer.from(await downloaded.arrayBuffer());
  if (received.length !== bytes.length || sha256(received) !== sha256(bytes)) {
    throw new Error("Storage download does not match the archived bytes.");
  }
}

async function main() {
  const [archivePath, mode, envPath] = process.argv.slice(2);
  if (
    !archivePath ||
    (mode && (mode !== "--apply" || !envPath)) ||
    process.argv.length > 5
  ) {
    throw new Error(
      "Usage: node scripts/restore-supabase-storage-archive.mjs <archive.zip> [--apply <env-file>]",
    );
  }
  const archive = await readFile(archivePath);
  if (sha256(archive) !== ARCHIVE_SHA256)
    throw new Error(
      "Storage archive checksum does not match the reviewed backup.",
    );
  const listing = execFileSync("unzip", ["-Z1", archivePath], {
    encoding: "utf8",
  });
  const objects = parseArchiveEntries(listing);
  execFileSync("unzip", ["-tqq", archivePath], { stdio: "pipe" });
  console.log(
    `Verified ${objects.length} archived Storage objects; ${objects.filter((o) => o.bucket === "pathway-public").length} public and ${objects.filter((o) => o.bucket === "pathway-private").length} private.`,
  );
  if (!mode) return;

  const secretKey = parse(
    await readFile(envPath),
  ).NEW_SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secretKey)
    throw new Error(
      "NEW_SUPABASE_SERVICE_ROLE_KEY is missing from the provided env file.",
    );
  for (const [index, object] of objects.entries()) {
    const bytes = execFileSync(
      "unzip",
      ["-p", archivePath, object.archivePath],
      { maxBuffer: 32 * 1024 * 1024 },
    );
    try {
      await uploadAndVerify(object, bytes, secretKey);
    } catch (error) {
      throw new Error(
        `Storage object ${index + 1}/${objects.length} failed verification: ${error instanceof Error ? error.message : "request failed"}`,
      );
    }
  }
  console.log(
    `Uploaded and downloaded ${objects.length}/${objects.length} Storage objects with matching bytes.`,
  );
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  try {
    await main();
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : "Storage archive restore failed.",
    );
    process.exitCode = 1;
  }
}
