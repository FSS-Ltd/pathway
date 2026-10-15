import request from "supertest";
import { withTenantRlsContext } from "@pathway/db";
import { requireDatabase } from "../../../test-helpers.e2e";
import {
  trackerEvidenceFixture,
  type TrackerEvidenceFixture,
} from "./tracker-evidence-fixture";
import type { TrackerEvidence } from "@pathway/types";

const bytes = Buffer.from(
  "%PDF-1.7\nSynthetic private compliance evidence\n%%EOF",
);
const input = {
  requirementId: "test-duty",
  requirementVersion: 1,
  title: "Private assessment",
  notes: "Confidential supporting notes",
  pdf: { fileName: "assessment.pdf", base64: bytes.toString("base64") },
};
describe("Tracker private evidence HTTP boundaries", () => {
  let f: TrackerEvidenceFixture | undefined;
  let oldBucket: string | undefined;
  beforeAll(async () => {
    if (!requireDatabase()) return;
    oldBucket = process.env.SUPABASE_STORAGE_PRIVATE_BUCKET;
    process.env.SUPABASE_STORAGE_PRIVATE_BUCKET = "tracker-evidence-private";
    f = await trackerEvidenceFixture();
  });
  afterAll(async () => {
    if (f) await f.app.close();
    if (oldBucket === undefined)
      delete process.env.SUPABASE_STORAGE_PRIVATE_BUCKET;
    else process.env.SUPABASE_STORAGE_PRIVATE_BUCKET = oldBucket;
  });
  async function create(): Promise<TrackerEvidence> {
    const response = await request(f!.app.getHttpServer())
      .post("/compliance/tracker/evidence")
      .set("Authorization", f!.manager.authorization)
      .send(input)
      .expect(201);
    return response.body as TrackerEvidence;
  }
  it("stores private evidence, streams verified attachments, and excludes storage internals from JSON", async () => {
    if (!f) return;
    const row = await create();
    expect(row).toMatchObject({
      title: input.title,
      notes: input.notes,
      fileName: input.pdf.fileName,
      archivedAt: null,
    });
    expect(row).not.toHaveProperty("storageKey");
    expect(row).not.toHaveProperty("sha256");
    expect(f.upload.mock.calls.at(-1)?.[0]).toMatchObject({
      bucket: "private",
      contentType: "application/pdf",
      body: bytes,
    });
    const response = await request(f.app.getHttpServer())
      .get(`/compliance/tracker/evidence/${row.id}/file`)
      .set("Authorization", f.reader.authorization)
      .expect(200)
      .expect("Cache-Control", "private, no-store")
      .expect("X-Content-Type-Options", "nosniff")
      .expect("Content-Type", /application\/pdf/)
      .expect("Content-Disposition", /attachment; filename="assessment.pdf"/);
    expect(response.body).toEqual(bytes);
    expect(f.download.mock.calls.at(-1)?.[0]).toBe("tracker-evidence-private");
  });
  it("denies cross-site, cross-organisation, ordinary-user and read-only writes before storage access", async () => {
    if (!f) return;
    const row = await create();
    const beforeDownloads = f.download.mock.calls.length;
    for (const token of [f.other.authorization, f.foreign.authorization]) {
      const list = await request(f.app.getHttpServer())
        .get("/compliance/tracker/evidence?requirementId=test-duty")
        .set("Authorization", token)
        .expect(200);
      expect(list.body.items).toEqual([]);
      await request(f.app.getHttpServer())
        .get(`/compliance/tracker/evidence/${row.id}/file`)
        .set("Authorization", token)
        .expect(404);
      await request(f.app.getHttpServer())
        .post(`/compliance/tracker/evidence/${row.id}/archive`)
        .set("Authorization", token)
        .expect(404);
      await request(f.app.getHttpServer())
        .get(
          `/compliance/tracker/evidence?requirementId=test-duty&cursor=${row.id}`,
        )
        .set("Authorization", token)
        .expect(404);
    }
    await request(f.app.getHttpServer())
      .get(`/compliance/tracker/evidence/${row.id}/file`)
      .set("Authorization", f.ordinary.authorization)
      .expect(403);
    expect(f.download).toHaveBeenCalledTimes(beforeDownloads);
    const beforeUploads = f.upload.mock.calls.length;
    for (const token of [f.reader.authorization, f.ordinary.authorization])
      await request(f.app.getHttpServer())
        .post("/compliance/tracker/evidence")
        .set("Authorization", token)
        .send(input)
        .expect(403);
    await request(f.app.getHttpServer())
      .post(`/compliance/tracker/evidence/${row.id}/archive`)
      .set("Authorization", f.reader.authorization)
      .expect(403);
    expect(f.upload).toHaveBeenCalledTimes(beforeUploads);
  });
  it("rejects malformed PDFs and unavailable storage without persisting evidence", async () => {
    if (!f) return;
    const before = await count();
    await request(f.app.getHttpServer())
      .post("/compliance/tracker/evidence")
      .set("Authorization", f.manager.authorization)
      .send({
        ...input,
        pdf: {
          fileName: "fake.pdf",
          base64: Buffer.from("not a pdf").toString("base64"),
        },
      })
      .expect(400);
    f.upload.mockRejectedValueOnce(
      new Error("Synthetic private storage failure"),
    );
    await request(f.app.getHttpServer())
      .post("/compliance/tracker/evidence")
      .set("Authorization", f.manager.authorization)
      .send(input)
      .expect(503);
    expect(await count()).toBe(before);
  });
  it("rejects corrupted or missing attachment bytes rather than streaming unverified data", async () => {
    if (!f) return;
    const row = await create();
    const key = f.upload.mock.calls.at(-1)![0].key;
    f.objects.set(key, Buffer.from("%PDF-1.7\nChanged content"));
    await request(f.app.getHttpServer())
      .get(`/compliance/tracker/evidence/${row.id}/file`)
      .set("Authorization", f.reader.authorization)
      .expect(503);
    f.objects.delete(key);
    await request(f.app.getHttpServer())
      .get(`/compliance/tracker/evidence/${row.id}/file`)
      .set("Authorization", f.reader.authorization)
      .expect(503);
  });
  it("archives idempotently while preserving historical attachment access and removing active evidence counts", async () => {
    if (!f) return;
    const row = await create();
    const before = await request(f.app.getHttpServer())
      .get("/compliance/tracker/checklist")
      .set("Authorization", f.reader.authorization)
      .expect(200);
    const first = await request(f.app.getHttpServer())
      .post(`/compliance/tracker/evidence/${row.id}/archive`)
      .set("Authorization", f.manager.authorization)
      .expect(201);
    const second = await request(f.app.getHttpServer())
      .post(`/compliance/tracker/evidence/${row.id}/archive`)
      .set("Authorization", f.manager.authorization)
      .expect(201);
    expect(first.body.archivedAt).toBeTruthy();
    expect(second.body.archivedAt).toBe(first.body.archivedAt);
    const after = await request(f.app.getHttpServer())
      .get("/compliance/tracker/checklist")
      .set("Authorization", f.reader.authorization)
      .expect(200);
    const evidenceCount = (body: {
      items: { requirement: { id: string }; evidenceCount: number }[];
    }) =>
      body.items.find((item) => item.requirement.id === "test-duty")!
        .evidenceCount;
    expect(evidenceCount(after.body)).toBe(evidenceCount(before.body) - 1);
    await request(f.app.getHttpServer())
      .get(`/compliance/tracker/evidence/${row.id}/file`)
      .set("Authorization", f.reader.authorization)
      .expect(200);
  });
  async function count() {
    return withTenantRlsContext(f!.siteId, f!.orgId, (tx) =>
      tx.complianceEvidence.count({ where: { tenantId: f!.siteId } }),
    );
  }
  async function revoke(userId: string) {
    await withTenantRlsContext(f!.siteId, f!.orgId, (tx) =>
      tx.userRoleAssignment.updateMany({
        where: { userId, orgId: f!.orgId },
        data: { revokedAt: new Date(), revokedById: f!.manager.userId },
      }),
    );
  }
  it("rechecks manage permission after upload and leaves no evidence row on revocation", async () => {
    if (!f) return;
    const local = f;
    const manager = await local.user(local.siteId, [
      "compliance.tracker.read",
      "compliance.tracker.manage",
    ]);
    const before = await count();
    local.upload.mockImplementationOnce(async (stored) => {
      local.objects.set(stored.key, Buffer.from(stored.body));
      await revoke(manager.userId);
      return { bucket: stored.bucket, key: stored.key };
    });
    await request(local.app.getHttpServer())
      .post("/compliance/tracker/evidence")
      .set("Authorization", manager.authorization)
      .send(input)
      .expect(403);
    expect(await count()).toBe(before);
  });
  it("rechecks read permission after download and withholds transferred bytes on revocation", async () => {
    if (!f) return;
    const local = f;
    const reader = await local.user(local.siteId, ["compliance.tracker.read"]);
    const row = await create();
    local.download.mockImplementationOnce(async (_bucket, key) => {
      await revoke(reader.userId);
      return local.objects.get(key) ?? null;
    });
    await request(local.app.getHttpServer())
      .get(`/compliance/tracker/evidence/${row.id}/file`)
      .set("Authorization", reader.authorization)
      .expect(403);
  });
});
