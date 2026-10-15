import { randomUUID } from "node:crypto";
import request from "supertest";
import { prisma, withTenantRlsContext } from "@pathway/db";
import { isEncryptedField } from "@pathway/util";
import { requireDatabase } from "../../../test-helpers.e2e";
import * as audit from "../../audit/audit.service";
import { agreementFixture, type AgreementFixture } from "./agreement-fixture";
const originalPdf = {
  fileName: "private-terms.pdf",
  base64: Buffer.from("%PDF-1.7\nOriginal terms").toString("base64"),
};
const input = {
  title: "Private title",
  contentText: "Private agreement wording",
  originalPdf,
};
describe("Agreement publication, acceptance and access boundaries", () => {
  let f: AgreementFixture | undefined;
  const previousBucket = process.env.SUPABASE_STORAGE_PRIVATE_BUCKET;
  beforeAll(async () => {
    if (!requireDatabase()) return;
    process.env.SUPABASE_STORAGE_PRIVATE_BUCKET = "agreement-private";
    f = await agreementFixture();
  });
  afterAll(async () => {
    if (f) await f.app.close();
    if (previousBucket === undefined)
      delete process.env.SUPABASE_STORAGE_PRIVATE_BUCKET;
    else process.env.SUPABASE_STORAGE_PRIVATE_BUCKET = previousBucket;
  });
  async function create() {
    if (!f) throw new Error("Fixture missing");
    return request(f.app.getHttpServer())
      .post("/compliance/agreements/documents")
      .set("Authorization", f.manager.authorization)
      .send(input)
      .expect((response) => {
        expect({ status: response.status, body: response.body }).toMatchObject({
          status: 201,
        });
      });
  }
  async function assign(versionId: string, recipientUserIds?: string[]) {
    if (!f) throw new Error("Fixture missing");
    return request(f.app.getHttpServer())
      .post(`/compliance/agreements/versions/${versionId}/assign`)
      .set("Authorization", f.manager.authorization)
      .send({
        recipientUserIds: recipientUserIds ?? [f.recipient.userId],
        adultsConfirmed: true,
      })
      .expect(201);
  }
  it("persists exact-version own acknowledgements without a general read grant; repeated assignment preserves history", async () => {
    if (!f) return;
    const server = f.app.getHttpServer();
    const doc = (await create()).body;
    const assignment = (await assign(doc.latestVersion.id)).body.items[0];
    await request(server)
      .get("/compliance/agreements/documents")
      .set("Authorization", f.recipient.authorization)
      .expect(403);
    await request(server)
      .get("/compliance/agreements/mine")
      .set("Authorization", f.recipient.authorization)
      .expect("Cache-Control", "private, no-store")
      .expect(200)
      .expect(({ body }) =>
        expect(body.items.map((row: { id: string }) => row.id)).toContain(
          assignment.id,
        ),
      );
    const accepted = await request(server)
      .post(`/compliance/agreements/assignments/${assignment.id}/acknowledge`)
      .set("Authorization", f.recipient.authorization)
      .send({
        versionId: doc.latestVersion.id,
        typedName: "Private acknowledgement name",
        confirmed: true,
      })
      .expect(201);
    expect(accepted.body.acceptance).toMatchObject({
      method: "ACKNOWLEDGED",
      typedName: "Private acknowledgement name",
      recordedByUserId: f.recipient.userId,
      hasSignedCopy: false,
    });
    const repeated = (await assign(doc.latestVersion.id)).body.items[0];
    expect(repeated.id).toBe(assignment.id);
    expect(repeated.acceptance.id).toBe(accepted.body.acceptance.id);
    const raw = await withTenantRlsContext(
      f.siteId,
      f.orgId,
      (tx) =>
        tx.$queryRaw<
          { title: string; contentText: string; typedName: string }[]
        >`SELECT v."title",v."contentText",a."typedName" FROM "ComplianceAgreementVersion" v JOIN "ComplianceAgreementAssignment" s ON s."versionId"=v.id JOIN "ComplianceAgreementAcceptance" a ON a."assignmentId"=s.id WHERE s.id=${assignment.id}`,
    );
    expect(Object.values(raw[0]).every(isEncryptedField)).toBe(true);
    expect(JSON.stringify(accepted.body)).not.toMatch(
      /StorageKey|Sha256|tenants\//,
    );
    const events = await withTenantRlsContext(f.siteId, f.orgId, (tx) =>
      tx.auditEvent.findMany({
        where: { tenantId: f!.siteId, entityType: "COMPLIANCE_AGREEMENT" },
      }),
    );
    expect(events.some((event) => event.action === "VIEWED")).toBe(true);
    expect(JSON.stringify(events)).not.toContain(
      "Private acknowledgement name",
    );
    expect(JSON.stringify(events)).not.toContain(input.contentText);
  });
  it("keeps published versions and acceptances immutable; supersedes accepted history without mutating it", async () => {
    if (!f) return;
    const server = f.app.getHttpServer(),
      doc = (await create()).body;
    const assignment = (await assign(doc.latestVersion.id)).body.items[0];
    const accepted = await request(server)
      .post(`/compliance/agreements/assignments/${assignment.id}/acknowledge`)
      .set("Authorization", f.recipient.authorization)
      .send({
        versionId: doc.latestVersion.id,
        typedName: "Adult",
        confirmed: true,
      })
      .expect(201);
    const publish = await request(server)
      .post(`/compliance/agreements/documents/${doc.id}/versions`)
      .set("Authorization", f.manager.authorization)
      .send({ ...input, title: "Revised terms", expectedVersion: 1 })
      .expect(201);
    expect(publish.body.latestVersion.version).toBe(2);
    const historical = await request(server)
      .get(`/compliance/agreements/assignments/${assignment.id}`)
      .set("Authorization", f.recipient.authorization)
      .expect(200);
    expect(historical.body.supersededAt).not.toBeNull();
    expect(historical.body.acceptance.id).toBe(accepted.body.acceptance.id);
    expect(historical.body.version.version).toBe(1);
    await request(server)
      .post(`/compliance/agreements/documents/${doc.id}/versions`)
      .set("Authorization", f.manager.authorization)
      .send({ ...input, expectedVersion: 1 })
      .expect(409);
    await request(server)
      .post(`/compliance/agreements/versions/${doc.latestVersion.id}/assign`)
      .set("Authorization", f.manager.authorization)
      .send({ recipientUserIds: [f.stranger.userId], adultsConfirmed: true })
      .expect(409);
    await expect(
      withTenantRlsContext(f.siteId, f.orgId, (tx) =>
        tx.complianceAgreementVersion.update({
          where: { id: doc.latestVersion.id },
          data: { title: "Changed" },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      withTenantRlsContext(f.siteId, f.orgId, (tx) =>
        tx.complianceAgreementAcceptance.update({
          where: { id: accepted.body.acceptance.id },
          data: { typedName: "Changed" },
        }),
      ),
    ).rejects.toThrow();
    const current = (await assign(publish.body.latestVersion.id)).body.items[0];
    expect(current.acceptance).toBeNull();
  });
  it("blocks cross-site, cross-org and other recipients, including original and signed files", async () => {
    if (!f) return;
    const server = f.app.getHttpServer(),
      doc = (await create()).body,
      assignment = (await assign(doc.latestVersion.id)).body.items[0];
    for (const identity of [f.stranger, f.otherManager, f.foreignManager]) {
      await request(server)
        .get(`/compliance/agreements/assignments/${assignment.id}`)
        .set("Authorization", identity.authorization)
        .expect(404);
      await request(server)
        .get(`/compliance/agreements/versions/${doc.latestVersion.id}/file`)
        .set("Authorization", identity.authorization)
        .expect(404);
      await request(server)
        .get(`/compliance/agreements/assignments/${assignment.id}/signed-copy`)
        .set("Authorization", identity.authorization)
        .expect(404);
      await request(server)
        .post(`/compliance/agreements/assignments/${assignment.id}/acknowledge`)
        .set("Authorization", identity.authorization)
        .send({
          versionId: doc.latestVersion.id,
          typedName: "Wrong person",
          confirmed: true,
        })
        .expect(404);
    }
    await request(server)
      .post(`/compliance/agreements/assignments/${assignment.id}/signed-copy`)
      .set("Authorization", f.reader.authorization)
      .send({
        versionId: doc.latestVersion.id,
        typedName: "Adult",
        signedOn: "2026-01-01",
        pdf: originalPdf,
      })
      .expect(403);
    const stored = await request(server)
      .post(`/compliance/agreements/assignments/${assignment.id}/signed-copy`)
      .set("Authorization", f.manager.authorization)
      .send({
        versionId: doc.latestVersion.id,
        typedName: "Adult",
        signedOn: "2026-01-01",
        pdf: originalPdf,
      })
      .expect(201);
    expect(stored.body.acceptance.method).toBe("RECORDED_SIGNED_COPY");
    expect(stored.body.acceptance.recordedByUserId).toBe(f.manager.userId);
    for (const url of [
      `/versions/${doc.latestVersion.id}/file`,
      `/assignments/${assignment.id}/signed-copy`,
    ])
      await request(server)
        .get(`/compliance/agreements${url}`)
        .set("Authorization", f.recipient.authorization)
        .expect("Content-Type", /application\/pdf/)
        .expect("Content-Disposition", /^attachment;/)
        .expect("Cache-Control", "private, no-store")
        .expect("X-Content-Type-Options", "nosniff")
        .expect(200);
    const hidden = await withTenantRlsContext(
      f.otherSiteId,
      f.orgId,
      async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL ROLE "pathway_e2e_tenant_rls"');
        return tx.complianceAgreementAssignment.findMany({
          where: { id: assignment.id },
        });
      },
    );
    expect(hidden).toEqual([]);
  });
  it("requires explicit adult confirmation and rejects known minors including linked student identities; rechecks age and membership before acceptance", async () => {
    if (!f) return;
    const server = f.app.getHttpServer(),
      doc = (await create()).body;
    const people = await request(server)
      .get("/compliance/agreements/people")
      .set("Authorization", f.manager.authorization)
      .expect(200);
    const eligibleIds = people.body.items.map((row: { id: string }) => row.id);
    expect(eligibleIds).not.toContain(f.minor.userId);
    expect(eligibleIds).not.toContain(f.linkedMinor.userId);
    expect(JSON.stringify(people.body)).not.toContain("dateOfBirth");
    for (const id of [
      f.minor.userId,
      f.linkedMinor.userId,
      f.otherManager.userId,
    ])
      await request(server)
        .post(`/compliance/agreements/versions/${doc.latestVersion.id}/assign`)
        .set("Authorization", f.manager.authorization)
        .send({ recipientUserIds: [id], adultsConfirmed: true })
        .expect(400);
    await request(server)
      .post(`/compliance/agreements/versions/${doc.latestVersion.id}/assign`)
      .set("Authorization", f.manager.authorization)
      .send({ recipientUserIds: [f.recipient.userId], adultsConfirmed: false })
      .expect(400);
    const newcomer = await f.user(f.siteId),
      assignment = (await assign(doc.latestVersion.id, [newcomer.userId])).body
        .items[0];
    await prisma.user.update({
      where: { id: newcomer.userId },
      data: { dateOfBirth: new Date("2020-01-01") },
    });
    await request(server)
      .post(`/compliance/agreements/assignments/${assignment.id}/acknowledge`)
      .set("Authorization", newcomer.authorization)
      .send({
        versionId: doc.latestVersion.id,
        typedName: "New user",
        confirmed: true,
      })
      .expect(400);
    await prisma.user.update({
      where: { id: newcomer.userId },
      data: { dateOfBirth: null, isActive: false },
    });
    const inactive = await request(server)
      .post(`/compliance/agreements/assignments/${assignment.id}/acknowledge`)
      .set("Authorization", newcomer.authorization)
      .send({
        versionId: doc.latestVersion.id,
        typedName: "New user",
        confirmed: true,
      });
    expect([401, 403]).toContain(inactive.status);
  });
  it("serializes concurrent publication and acceptance and rejects stale version confirmation", async () => {
    if (!f) return;
    const server = f.app.getHttpServer(),
      doc = (await create()).body,
      assignment = (await assign(doc.latestVersion.id)).body.items[0];
    await request(server)
      .post(`/compliance/agreements/assignments/${assignment.id}/acknowledge`)
      .set("Authorization", f.recipient.authorization)
      .send({ versionId: randomUUID(), typedName: "Adult", confirmed: true })
      .expect(409);
    const [published, ack] = await Promise.all([
      request(server)
        .post(`/compliance/agreements/documents/${doc.id}/versions`)
        .set("Authorization", f.manager.authorization)
        .send({ ...input, originalPdf: null, expectedVersion: 1 }),
      request(server)
        .post(`/compliance/agreements/assignments/${assignment.id}/acknowledge`)
        .set("Authorization", f.recipient.authorization)
        .send({
          versionId: doc.latestVersion.id,
          typedName: "Adult",
          confirmed: true,
        }),
    ]);
    expect(published.status).toBe(201);
    expect([201, 409]).toContain(ack.status);
    const saved = await request(server)
      .get(`/compliance/agreements/assignments/${assignment.id}`)
      .set("Authorization", f.recipient.authorization)
      .expect(200);
    expect(saved.body.supersededAt).not.toBeNull();
    if (ack.status === 201)
      expect(saved.body.acceptance.id).toBe(ack.body.acceptance.id);
    else expect(saved.body.acceptance).toBeNull();
    await request(server)
      .post(`/compliance/agreements/assignments/${assignment.id}/acknowledge`)
      .set("Authorization", f.recipient.authorization)
      .send({
        versionId: doc.latestVersion.id,
        typedName: "Adult",
        confirmed: true,
      })
      .expect(409);
    const managerAuthorization = f.manager.authorization;
    const results = await Promise.all(
      [1, 2].map(() =>
        request(server)
          .post(`/compliance/agreements/documents/${doc.id}/versions`)
          .set("Authorization", managerAuthorization)
          .send({ ...input, originalPdf: null, expectedVersion: 2 }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
  });
  it("rolls back database writes on audit failure and fails closed for storage unavailability or tampering", async () => {
    if (!f) return;
    const server = f.app.getHttpServer(),
      doc = (await create()).body,
      assignment = (await assign(doc.latestVersion.id)).body.items[0];
    const spy = jest
      .spyOn(audit, "recordAuditEventInTransaction")
      .mockRejectedValueOnce(new Error("Deliberate audit failure"));
    try {
      await request(server)
        .post(`/compliance/agreements/assignments/${assignment.id}/acknowledge`)
        .set("Authorization", f.recipient.authorization)
        .send({
          versionId: doc.latestVersion.id,
          typedName: "Adult",
          confirmed: true,
        })
        .expect(500);
    } finally {
      spy.mockRestore();
    }
    const row = await request(server)
      .get(`/compliance/agreements/assignments/${assignment.id}`)
      .set("Authorization", f.recipient.authorization)
      .expect(200);
    expect(row.body.acceptance).toBeNull();
    f.upload.mockRejectedValueOnce(new Error("Unavailable"));
    await request(server)
      .post("/compliance/agreements/documents")
      .set("Authorization", f.manager.authorization)
      .send(input)
      .expect(503);
    f.download.mockResolvedValueOnce(Buffer.from("Tampered"));
    await request(server)
      .get(`/compliance/agreements/versions/${doc.latestVersion.id}/file`)
      .set("Authorization", f.recipient.authorization)
      .expect(503);
    await request(server)
      .post("/compliance/agreements/documents")
      .set("Authorization", f.manager.authorization)
      .send({ ...input, orgId: f.foreignOrgId })
      .expect(400);
  });
});
