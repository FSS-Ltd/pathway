/**
 * Finance private-storage lifecycle proof against a REAL Supabase Storage API.
 *
 * Not part of `pnpm test`: it needs a disposable local stack. It fails (never
 * skips) when the stack is missing, and refuses any non-loopback SUPABASE_URL.
 *
 * Required env: SUPABASE_URL (loopback), SUPABASE_SECRET_KEY (service role),
 * SUPABASE_ANON_KEY (anon role). Buckets are created by this script.
 * Run: pnpm --filter @pathway/api test:finance-storage
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { loadOrCreateFinanceDocument } from "../src/finance/finance-document-storage";
import { SupabaseStorageService } from "../src/common/storage/supabase-storage.service";

const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, "") ?? "";
const serviceKey = process.env.SUPABASE_SECRET_KEY?.trim() ?? "";
const anonKey = process.env.SUPABASE_ANON_KEY?.trim() ?? "";
if (!url || !serviceKey || !anonKey) {
  throw new Error(
    "SUPABASE_URL, SUPABASE_SECRET_KEY and SUPABASE_ANON_KEY are required",
  );
}
const host = new URL(url).hostname;
if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) {
  throw new Error(`Refusing non-loopback storage host ${host}`);
}

const suffix = randomUUID().slice(0, 8);
const privateBucket = `finance-private-${suffix}`;
const publicBucket = `finance-public-${suffix}`;
process.env.SUPABASE_STORAGE_PRIVATE_BUCKET = privateBucket;
process.env.SUPABASE_STORAGE_PUBLIC_BUCKET = publicBucket;

const api = `${url}/storage/v1`;
const asService = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  "Content-Type": "application/json",
};

async function createBucket(name: string, isPublic: boolean) {
  const response = await fetch(`${api}/bucket`, {
    method: "POST",
    headers: asService,
    body: JSON.stringify({ name, public: isPublic }),
  });
  assert.equal(
    response.status,
    200,
    `bucket ${name}: ${await response.text()}`,
  );
}

await createBucket(privateBucket, false);
await createBucket(publicBucket, true);

const storage = new SupabaseStorageService();
assert.ok(storage.isConfigured(), "storage must be configured");

const pdf = (label: string) =>
  Buffer.from(`%PDF-1.7\n% ${label}\n${"x".repeat(600)}\n%%EOF`);
const tenantId = randomUUID();
const key = (name: string) =>
  `tenants/${tenantId}/finance-documents/${randomUUID()}/${name}.pdf`;
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

// 1. Create once; a later request with different render bytes gets the winner.
const invoiceKey = key("invoice");
const first = await loadOrCreateFinanceDocument(storage, invoiceKey, async () =>
  pdf("first"),
);
const second = await loadOrCreateFinanceDocument(
  storage,
  invoiceKey,
  async () => pdf("second"),
);
assert.equal(sha(second), sha(first), "stored bytes must not be overwritten");
assert.match(second.toString("latin1"), /first/);

// 2. Racing creators never return divergent bytes. The disposable stack uses
//    Storage's file backend, which can answer a read with a transient 500 while
//    another request is mid-write; the service must then fail closed (503) and a
//    retry must converge on the one canonical object.
const raceKey = key("receipt");
const settled = await Promise.allSettled(
  Array.from({ length: 5 }, (_, index) =>
    loadOrCreateFinanceDocument(storage, raceKey, async () =>
      pdf(`racer-${index}`),
    ),
  ),
);
for (const result of settled) {
  if (result.status === "rejected") {
    assert.match(String(result.reason), /storage is unavailable/);
  }
}
const retried = await loadOrCreateFinanceDocument(storage, raceKey, async () =>
  pdf("late-racer"),
);
const raced = [
  ...settled.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  ),
  retried,
];
assert.equal(new Set(raced.map(sha)).size, 1, "racers must see one document");
const stored = await storage.downloadObject(privateBucket, raceKey);
assert.equal(sha(stored!), sha(retried), "stored object is the canonical one");
console.log(
  `race: ${raced.length - 1}/5 racers converged, ${settled.filter((r) => r.status === "rejected").length} failed closed`,
);

// 3. Direct create-only upload keeps existing bytes; overwrite:true is the
//    control that proves this test can detect an overwrite.
const guarded = await storage.uploadObject({
  bucket: "private",
  key: raceKey,
  body: pdf("replacement"),
  contentType: "application/pdf",
  overwrite: false,
});
assert.deepEqual(guarded, { bucket: privateBucket, key: raceKey });
assert.equal(
  sha((await storage.downloadObject(privateBucket, raceKey))!),
  sha(raced[0]),
  "create-only upload must keep the original bytes",
);
const controlKey = key("credit-note");
await storage.uploadObject({
  bucket: "private",
  key: controlKey,
  body: pdf("control-a"),
  contentType: "application/pdf",
});
await storage.uploadObject({
  bucket: "private",
  key: controlKey,
  body: pdf("control-b"),
  contentType: "application/pdf",
  overwrite: true,
});
assert.match(
  (await storage.downloadObject(privateBucket, controlKey))!.toString("latin1"),
  /control-b/,
  "control: explicit overwrite must replace bytes",
);

// 4. Statement object identity is its content digest.
const statementBytes = pdf("statement");
const statementKey = `tenants/${tenantId}/finance-statements/${randomUUID()}/${sha(statementBytes)}.pdf`;
await storage.uploadObject({
  bucket: "private",
  key: statementKey,
  body: statementBytes,
  contentType: "application/pdf",
  overwrite: false,
});
const statement = await storage.downloadObject(privateBucket, statementKey);
assert.equal(
  sha(statement!),
  statementKey.split("/").pop()!.replace(".pdf", ""),
);

// 5. The private bucket is never reachable without the service key.
const objectPath = `${privateBucket}/${invoiceKey}`;
const denied = async (label: string, request: Promise<Response>) => {
  const response = await request;
  assert.notEqual(response.status, 200, `${label} must not return the object`);
  assert.ok(
    [400, 401, 403, 404].includes(response.status),
    `${label} returned unexpected status ${response.status}`,
  );
  const body = Buffer.from(await response.arrayBuffer());
  assert.ok(!body.toString("latin1").includes("%PDF"), `${label} leaked bytes`);
};
await denied("public URL", fetch(`${api}/object/public/${objectPath}`));
await denied("unauthenticated", fetch(`${api}/object/${objectPath}`));
await denied(
  "anon role",
  fetch(`${api}/object/${objectPath}`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  }),
);
await denied(
  "anon authenticated-path",
  fetch(`${api}/object/authenticated/${objectPath}`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  }),
);
const bucketInfo = await fetch(`${api}/bucket/${privateBucket}`, {
  headers: asService,
});
assert.equal(((await bucketInfo.json()) as { public: boolean }).public, false);

// 6. Keys outside the Finance allow-list are refused before any request.
await assert.rejects(
  storage.uploadObject({
    bucket: "private",
    key: `tenants/${tenantId}/finance-documents/not-a-uuid/other.pdf`,
    body: pdf("bad"),
    contentType: "application/pdf",
  }),
  /allow-listed/,
);

// 7. A missing object reads as absent, and storage failure fails closed.
assert.equal(await storage.downloadObject(privateBucket, key("receipt")), null);
process.env.SUPABASE_URL = "http://127.0.0.1:9";
await assert.rejects(
  loadOrCreateFinanceDocument(storage, key("invoice"), async () => pdf("x")),
  /Finance document storage is unavailable/,
);
process.env.SUPABASE_URL = url;

console.log("finance private-storage lifecycle: PASS");
