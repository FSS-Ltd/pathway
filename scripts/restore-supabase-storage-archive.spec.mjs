import assert from "node:assert/strict";
import test from "node:test";
import {
  parseArchiveEntries,
  uploadAndVerify,
} from "./restore-supabase-storage-archive.mjs";

const prefix = "fkajodqkxysfcnfhizwn";
const publicObject = `${prefix}/pathway-public/blog/assets/a.jpg`;
const privateObject = `${prefix}/pathway-private/tenants/t1/children/c1/photo.png`;

test("accepts only the reviewed project and buckets", () => {
  const entries = parseArchiveEntries(`${publicObject}\n${privateObject}\n`, 2);
  assert.equal(entries[0].key, "blog/assets/a.jpg");
  assert.equal(entries[0].contentType, "image/jpeg");
  assert.equal(entries[1].bucket, "pathway-private");
  for (const invalid of [
    publicObject.replace(prefix, "other"),
    `${prefix}/other/a.jpg`,
    `${prefix}/pathway-public/../a.jpg`,
  ]) {
    assert.throws(
      () => parseArchiveEntries(invalid, 1),
      /unexpected object path/,
    );
  }
  assert.throws(
    () => parseArchiveEntries(`${publicObject}\n${publicObject}`, 2),
    /uniqueness/,
  );
  assert.throws(
    () => parseArchiveEntries(`${prefix}/pathway-public/blog/assets/a.txt`, 1),
    /unsupported content type/,
  );
});

test("uploads and verifies the downloaded bytes", async () => {
  const object = parseArchiveEntries(publicObject, 1)[0];
  const bytes = Buffer.from("archived image");
  const calls = [];
  await uploadAndVerify(object, bytes, "test-secret", async (url, options) => {
    calls.push({ url, options });
    return options.method === "POST"
      ? new globalThis.Response(null, { status: 200 })
      : new globalThis.Response(bytes);
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers["x-upsert"], "true");
  assert.equal(calls[0].options.headers.apikey, "test-secret");
  assert.equal(calls[1].options.method, "GET");
  assert.match(calls[0].url, /^https:\/\/jzofykdzpuslpdyfovxp\.supabase\.co\//);
});

test("rejects a download with different bytes", async () => {
  const object = parseArchiveEntries(publicObject, 1)[0];
  await assert.rejects(
    uploadAndVerify(
      object,
      Buffer.from("source"),
      "test-secret",
      async (_url, options) =>
        options.method === "POST"
          ? new globalThis.Response(null, { status: 200 })
          : new globalThis.Response("target"),
    ),
    /does not match/,
  );
});

test("stops when the Storage API rejects an upload", async () => {
  const object = parseArchiveEntries(publicObject, 1)[0];
  await assert.rejects(
    uploadAndVerify(
      object,
      Buffer.from("source"),
      "test-secret",
      async () => new globalThis.Response(null, { status: 403 }),
    ),
    /HTTP 403/,
  );
});
