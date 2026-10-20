import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Module, ModuleStatus, prisma, Vertical } from "@pathway/db";
import { randomUUID } from "node:crypto";
import request from "supertest";
import {
  clearE2eAuthAccess,
  isDatabaseAvailable,
  requireDatabase,
  seedE2eAuthUser,
} from "../../../test-helpers.e2e";
import { AppModule } from "../../app.module";

const HOMEWORK_KEYS = [
  "ace.homework.assignments.read",
  "ace.homework.assignments.manage",
  "ace.homework.submissions.write",
  "ace.homework.evidence.read",
  "ace.homework.evidence.write",
  "ace.homework.reviews.manage",
  "ace.homework.family.read",
] as const;

describe("ACE homework entitlement (e2e)", () => {
  const aceOrgId = randomUUID();
  const otherOrgId = randomUUID();
  const aceSiteId = randomUUID();
  const otherSiteId = randomUUID();
  const aceUserId = randomUUID();
  const otherUserId = randomUUID();
  let app: INestApplication | undefined;
  let aceAuthorization = "";
  let otherAuthorization = "";

  beforeAll(async () => {
    if (!requireDatabase()) return;

    await prisma.org.createMany({
      data: [
        {
          id: aceOrgId,
          slug: `ace-homework-${aceOrgId}`,
          name: "ACE homework test",
          planCode: "INSTITUTIONAL_GROWTH_MONTHLY",
        },
        {
          id: otherOrgId,
          slug: `other-homework-${otherOrgId}`,
          name: "Other homework test",
          planCode: "trial",
        },
      ],
    });
    await prisma.tenant.createMany({
      data: [
        {
          id: aceSiteId,
          orgId: aceOrgId,
          slug: `ace-homework-${aceSiteId}`,
          name: "ACE site",
          timezone: "Europe/London",
        },
        {
          id: otherSiteId,
          orgId: otherOrgId,
          slug: `other-homework-${otherSiteId}`,
          name: "Other site",
          timezone: "Europe/London",
        },
      ],
    });
    await prisma.orgVertical.createMany({
      data: [
        { orgId: aceOrgId, vertical: Vertical.ACE_SCHOOL },
        { orgId: otherOrgId, vertical: Vertical.CHURCH },
      ],
    });
    aceAuthorization = (
      await seedE2eAuthUser({
        subject: `ace-homework-${aceUserId}`,
        userId: aceUserId,
        tenantId: aceSiteId,
        siteRole: "STAFF",
        orgId: aceOrgId,
        orgRole: "ORG_MEMBER",
      })
    ).authorization;
    otherAuthorization = (
      await seedE2eAuthUser({
        subject: `other-homework-${otherUserId}`,
        userId: otherUserId,
        tenantId: otherSiteId,
        siteRole: "STAFF",
        orgId: otherOrgId,
        orgRole: "ORG_MEMBER",
      })
    ).authorization;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (!isDatabaseAvailable()) return;
    await app?.close();
    await prisma.orgModule.deleteMany({ where: { orgId: otherOrgId } });
    await clearE2eAuthAccess(aceUserId);
    await clearE2eAuthAccess(otherUserId);
    await prisma.user.deleteMany({
      where: { id: { in: [aceUserId, otherUserId] } },
    });
    await prisma.orgVertical.deleteMany({
      where: { orgId: { in: [aceOrgId, otherOrgId] } },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: [aceSiteId, otherSiteId] } },
    });
    await prisma.org.deleteMany({
      where: { id: { in: [aceOrgId, otherOrgId] } },
    });
  });

  it("grants ACE homework on an institutional plan without a Learning add-on", async () => {
    if (!app) return;
    expect(await prisma.orgModule.count({ where: { orgId: aceOrgId } })).toBe(
      0,
    );

    const response = await request(app.getHttpServer())
      .get("/platform/capabilities")
      .set("Authorization", aceAuthorization);
    expect(response.status).toBe(200);
    expect(response.body.capabilities).toEqual(
      expect.arrayContaining(HOMEWORK_KEYS),
    );
  });

  it("grants the same homework subset to an ACE learning centre", async () => {
    if (!app) return;
    await prisma.orgVertical.update({
      where: { orgId: aceOrgId },
      data: { vertical: Vertical.ACE_LEARNING_CENTRE },
    });

    const response = await request(app.getHttpServer())
      .get("/platform/capabilities")
      .set("Authorization", aceAuthorization);
    expect(response.status).toBe(200);
    expect(response.body.capabilities).toEqual(
      expect.arrayContaining(HOMEWORK_KEYS),
    );
    expect(await prisma.orgModule.count({ where: { orgId: aceOrgId } })).toBe(
      0,
    );
  });

  it("does not grant ACE homework through an active or inactive Learning add-on", async () => {
    if (!app) return;
    await prisma.orgModule.create({
      data: {
        orgId: otherOrgId,
        module: Module.LEARNING,
        status: ModuleStatus.ACTIVE,
      },
    });

    for (const status of [
      ModuleStatus.ACTIVE,
      ModuleStatus.EXPIRED,
      ModuleStatus.CANCELLED,
    ]) {
      await prisma.orgModule.update({
        where: { orgId_module: { orgId: otherOrgId, module: Module.LEARNING } },
        data: { status },
      });
      const response = await request(app.getHttpServer())
        .get("/platform/capabilities")
        .set("Authorization", otherAuthorization);
      expect(response.status).toBe(200);
      expect(response.body.capabilities).toContain("learning.log.read");
      for (const key of HOMEWORK_KEYS) {
        expect(response.body.capabilities).not.toContain(key);
      }
    }
  });
});
