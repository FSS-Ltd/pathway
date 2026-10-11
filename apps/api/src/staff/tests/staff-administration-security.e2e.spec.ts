import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma } from "@pathway/db";
import request from "supertest";
import { AppModule } from "../../app.module";
import { requireDatabase, seedE2eAuthUser } from "../../../test-helpers.e2e";

const orgId = randomUUID();
const siteId = randomUUID();
const otherSiteId = randomUUID();
const targetId = randomUUID();
const otherTargetId = randomUUID();
const staffId = randomUUID();
const siteAdminId = randomUUID();
const orgAdminId = randomUUID();

describe("staff administration security", () => {
  let app: INestApplication | undefined;
  let staffAuthorization = "";
  let siteAdminAuthorization = "";
  let orgAdminAuthorization = "";

  beforeAll(async () => {
    if (!requireDatabase()) return;
    await prisma.org.create({
      data: {
        id: orgId,
        name: "Staff security school",
        slug: `staff-security-${orgId}`,
        planCode: "trial",
      },
    });
    await prisma.tenant.createMany({
      data: [
        { id: siteId, orgId, name: "First site", slug: `staff-${siteId}` },
        {
          id: otherSiteId,
          orgId,
          name: "Second site",
          slug: `staff-${otherSiteId}`,
        },
      ],
    });

    const seed = async (
      userId: string,
      tenantId: string,
      siteRole: "STAFF" | "SITE_ADMIN",
      orgRole: "ORG_MEMBER" | "ORG_ADMIN" = "ORG_MEMBER",
    ) =>
      (
        await seedE2eAuthUser({
          subject: `staff-security-${userId}`,
          userId,
          tenantId,
          siteRole,
          orgId,
          orgRole,
        })
      ).authorization;

    await seed(targetId, siteId, "STAFF");
    await seed(otherTargetId, otherSiteId, "STAFF");
    staffAuthorization = await seed(staffId, siteId, "STAFF");
    siteAdminAuthorization = await seed(siteAdminId, siteId, "SITE_ADMIN");
    orgAdminAuthorization = await seed(
      orgAdminId,
      siteId,
      "SITE_ADMIN",
      "ORG_ADMIN",
    );

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("denies staff reads and writes before touching another account", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    const read = await request(server)
      .get(`/staff/${targetId}`)
      .set("Authorization", staffAuthorization);
    const write = await request(server)
      .patch(`/staff/${targetId}`)
      .set("Authorization", staffAuthorization)
      .send({ isActive: false });
    const assignmentLookup = await request(server)
      .get("/staff/for-session-assignment")
      .set("Authorization", staffAuthorization)
      .query({
        startsAt: "2026-10-12T09:00:00Z",
        endsAt: "2026-10-12T10:00:00Z",
      });

    expect(read.status).toBe(403);
    expect(write.status).toBe(403);
    expect(assignmentLookup.status).toBe(403);
    expect(
      await prisma.user.findUniqueOrThrow({
        where: { id: targetId },
        select: { isActive: true },
      }),
    ).toEqual({ isActive: true });
  });

  it("allows a site leader's staff edit but keeps global account status with the organisation admin", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    const read = await request(server)
      .get(`/staff/${targetId}`)
      .set("Authorization", siteAdminAuthorization);
    const assignmentLookup = await request(server)
      .get("/staff/for-session-assignment")
      .set("Authorization", siteAdminAuthorization)
      .query({
        startsAt: "2026-10-12T09:00:00Z",
        endsAt: "2026-10-12T10:00:00Z",
      });
    const edit = await request(server)
      .patch(`/staff/${targetId}`)
      .set("Authorization", siteAdminAuthorization)
      .send({ firstName: "Updated" });
    const globalChange = await request(server)
      .patch(`/staff/${targetId}`)
      .set("Authorization", siteAdminAuthorization)
      .send({ firstName: "Should not save", isActive: false });
    const wrongSite = await request(server)
      .get(`/staff/${otherTargetId}`)
      .set("Authorization", siteAdminAuthorization);

    expect(read.status).toBe(200);
    expect(assignmentLookup.status).toBe(200);
    expect(edit.status).toBe(200);
    expect(globalChange.status).toBe(403);
    expect(wrongSite.status).toBe(404);
    expect(
      await prisma.user.findUniqueOrThrow({
        where: { id: targetId },
        select: { firstName: true, isActive: true },
      }),
    ).toEqual({ firstName: "Updated", isActive: true });
  });

  it("audits an organisation admin's account disable", async () => {
    if (!app) return;
    const response = await request(app.getHttpServer())
      .patch(`/staff/${targetId}`)
      .set("Authorization", orgAdminAuthorization)
      .send({ isActive: false });

    expect(response.status).toBe(200);
    expect(
      await prisma.user.findUniqueOrThrow({
        where: { id: targetId },
        select: { isActive: true },
      }),
    ).toEqual({ isActive: false });
    expect(
      await prisma.auditEvent.findFirst({
        where: {
          actorUserId: orgAdminId,
          entityId: targetId,
          entityType: "ACE_RECORD",
        },
        select: { metadata: true },
      }),
    ).toMatchObject({
      metadata: { kind: "STAFF_ACCOUNT_STATUS", action: "disable" },
    });
  });
});
