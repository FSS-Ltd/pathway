import { randomUUID } from "node:crypto";
import request from "supertest";
import { prisma, withTenantRlsContext } from "@pathway/db";
import { requireDatabase, seedE2eAuthUser } from "../../../test-helpers.e2e";
import { agreementFixture, type AgreementFixture } from "./agreement-fixture";

describe("Agreement transfer authorization", () => {
  let fixture: AgreementFixture | undefined;
  beforeAll(async () => {
    if (requireDatabase()) fixture = await agreementFixture();
  });
  afterAll(async () => {
    if (fixture) await fixture.app.close();
  });
  it("rechecks permission after the private upload and commits no document if access was revoked", async () => {
    if (!fixture) return;
    const f = fixture;
    const manager = await f.user(f.siteId, [
      "compliance.agreements.read",
      "compliance.agreements.manage",
    ]);
    f.upload.mockImplementationOnce(async (input) => {
      f.objects.set(input.key, input.body);
      await withTenantRlsContext(f.siteId, f.orgId, (tx) =>
        tx.userRoleAssignment.updateMany({
          where: { userId: manager.userId, orgId: f.orgId },
          data: { revokedAt: new Date(), revokedById: f.manager.userId },
        }),
      );
      return { bucket: "agreement-private", key: input.key };
    });
    await request(f.app.getHttpServer())
      .post("/compliance/agreements/documents")
      .set("Authorization", manager.authorization)
      .send({
        title: "Transfer authorization",
        contentText: "Terms",
        originalPdf: {
          fileName: "terms.pdf",
          base64: Buffer.from("%PDF-1.7\nTerms").toString("base64"),
        },
      })
      .expect(403);
    const documents = await withTenantRlsContext(f.siteId, f.orgId, (tx) =>
      tx.complianceAgreementDocument.count({
        where: { tenantId: f.siteId, createdByUserId: manager.userId },
      }),
    );
    expect(documents).toBe(0);
    expect(f.upload).toHaveBeenCalledTimes(1);
  });
  it("denies the self-assignment surface to Home even with an active adult account", async () => {
    if (!fixture) return;
    const orgId = randomUUID(),
      tenantId = randomUUID();
    await prisma.org.create({
      data: {
        id: orgId,
        name: "Home test",
        slug: `home-agreement-${orgId}`,
        planCode: "trial",
      },
    });
    await prisma.orgVertical.create({
      data: { orgId, vertical: "HOME_EDUCATION" },
    });
    await prisma.tenant.create({
      data: {
        id: tenantId,
        orgId,
        name: "Home test",
        slug: `home-agreement-${tenantId}`,
        timezone: "Europe/London",
      },
    });
    const user = await seedE2eAuthUser({
      subject: `home-agreement-${randomUUID()}`,
      tenantId,
      orgId,
      siteRole: "SITE_ADMIN",
      orgRole: "ORG_ADMIN",
    });
    await request(fixture.app.getHttpServer())
      .get("/compliance/agreements/mine")
      .set("Authorization", user.authorization)
      .expect(403);
  });
});
