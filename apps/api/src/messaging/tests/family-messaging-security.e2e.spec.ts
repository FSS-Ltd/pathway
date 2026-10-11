import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma, withTenantRlsContext } from "@pathway/db";
import request from "supertest";
import { AppModule } from "../../app.module";
import {
  requireDatabase,
  seedE2eAuthUser,
  seedE2eTypedRole,
} from "../../../test-helpers.e2e";

const orgId = randomUUID();
const otherOrgId = randomUUID();
const siteId = randomUUID();
const otherSiteId = randomUUID();
const childId = randomUUID();
const teacherId = randomUUID();
const supervisorId = randomUUID();
const headId = randomUUID();
const supportId = randomUUID();
const guardianId = randomUUID();
const otherGuardianId = randomUUID();
const studentId = randomUUID();
const otherSiteStaffId = randomUUID();

type Actor = {
  id: string;
  subject: string;
  tenantId: string;
  orgId: string;
  siteRole?: "STAFF" | "SITE_ADMIN";
  orgRole?: "ORG_MEMBER" | "ORG_ADMIN";
  messagingPermissions?: boolean;
};

const actors: Record<string, Actor> = {
  teacher: {
    id: teacherId,
    subject: `family-gate-teacher-${teacherId}`,
    tenantId: siteId,
    orgId,
    siteRole: "STAFF",
    orgRole: "ORG_MEMBER",
    messagingPermissions: true,
  },
  supervisor: {
    id: supervisorId,
    subject: `family-gate-supervisor-${supervisorId}`,
    tenantId: siteId,
    orgId,
    siteRole: "STAFF",
    orgRole: "ORG_MEMBER",
    messagingPermissions: true,
  },
  head: {
    id: headId,
    subject: `family-gate-head-${headId}`,
    tenantId: siteId,
    orgId,
    siteRole: "SITE_ADMIN",
    orgRole: "ORG_ADMIN",
    messagingPermissions: true,
  },
  support: {
    id: supportId,
    subject: `family-gate-support-${supportId}`,
    tenantId: siteId,
    orgId,
    orgRole: "ORG_MEMBER",
    messagingPermissions: true,
  },
  guardian: {
    id: guardianId,
    subject: `family-gate-guardian-${guardianId}`,
    tenantId: siteId,
    orgId,
  },
  otherGuardian: {
    id: otherGuardianId,
    subject: `family-gate-other-guardian-${otherGuardianId}`,
    tenantId: siteId,
    orgId,
  },
  student: {
    id: studentId,
    subject: `family-gate-student-${studentId}`,
    tenantId: siteId,
    orgId,
  },
  otherSiteStaff: {
    id: otherSiteStaffId,
    subject: `family-gate-other-site-${otherSiteStaffId}`,
    tenantId: otherSiteId,
    orgId: otherOrgId,
    siteRole: "STAFF",
    orgRole: "ORG_MEMBER",
    messagingPermissions: true,
  },
};

const staffPath = "/ace/messages/conversations";
const parentPath = (site: string) =>
  `/ace/parent/sites/${site}/messages/conversations`;

describe("ACE family messaging web security gate", () => {
  let app: INestApplication | undefined;
  const authorization: Record<string, string> = {};
  let staffConversationId = "";
  let parentConversationId = "";
  let guardianIdentityId = "";

  beforeAll(async () => {
    if (!requireDatabase()) return;
    await prisma.org.createMany({
      data: [
        {
          id: orgId,
          name: "Family gate school",
          slug: `family-gate-${orgId}`,
          planCode: "trial",
          parentPortalEnabled: true,
        },
        {
          id: otherOrgId,
          name: "Other family gate school",
          slug: `family-gate-${otherOrgId}`,
          planCode: "trial",
          parentPortalEnabled: true,
        },
      ],
    });
    await prisma.orgVertical.createMany({
      data: [
        { orgId, vertical: "ACE_SCHOOL" },
        { orgId: otherOrgId, vertical: "ACE_SCHOOL" },
      ],
    });
    await prisma.tenant.createMany({
      data: [
        { id: siteId, orgId, name: "Family gate", slug: `gate-${siteId}` },
        {
          id: otherSiteId,
          orgId: otherOrgId,
          name: "Other gate",
          slug: `gate-${otherSiteId}`,
        },
      ],
    });

    for (const [name, actor] of Object.entries(actors)) {
      authorization[name] = (
        await seedE2eAuthUser({
          subject: actor.subject,
          userId: actor.id,
          tenantId: actor.tenantId,
          siteRole: actor.siteRole,
          orgId: actor.orgId,
          orgRole: actor.orgRole,
        })
      ).authorization;
      if (actor.messagingPermissions) {
        await seedE2eTypedRole({
          orgId: actor.orgId,
          tenantId: actor.tenantId,
          userId: actor.id,
          scope: "site",
          permissionKeys: [
            "messaging.conversations.read",
            "messaging.messages.read",
            "messaging.conversations.create",
            "messaging.messages.send",
          ],
        });
      }
    }

    await withTenantRlsContext(siteId, orgId, async (tx) => {
      await tx.child.create({
        data: {
          id: childId,
          tenantId: siteId,
          firstName: "Ari",
          lastName: "Gate",
        },
      });
      const guardian = await tx.guardianIdentity.create({
        data: { tenantId: siteId, userId: guardianId },
      });
      guardianIdentityId = guardian.id;
      const otherGuardian = await tx.guardianIdentity.create({
        data: { tenantId: siteId, userId: otherGuardianId },
      });
      await tx.guardianChildRelationship.createMany({
        data: [guardian.id, otherGuardian.id].map((identityId) => ({
          tenantId: siteId,
          guardianIdentityId: identityId,
          childId,
          legalAccess: "FULL",
          startsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        })),
      });
      await tx.studentPortalPolicy.create({
        data: { tenantId: siteId, studentPortalEnabled: true },
      });
      const student = await tx.studentIdentity.create({
        data: { tenantId: siteId, userId: studentId },
      });
      await tx.studentIdentityLink.create({
        data: { tenantId: siteId, studentIdentityId: student.id, childId },
      });
      const staffConversation = await tx.messageConversation.create({
        data: {
          kind: "STAFF_DIRECT",
          tenant: { connect: { id: siteId } },
          createdBy: { connect: { id: teacherId } },
          participants: {
            create: [teacherId, headId].map((userId) => ({
              kind: "STAFF" as const,
              tenant: { connect: { id: siteId } },
              user: { connect: { id: userId } },
            })),
          },
        },
        select: { id: true },
      });
      staffConversationId = staffConversation.id;
      const parentConversation = await tx.messageConversation.create({
        data: {
          kind: "PARENT_STAFF",
          tenant: { connect: { id: siteId } },
          createdBy: { connect: { id: guardianId } },
          guardianIdentity: {
            connect: { id_tenantId: { id: guardian.id, tenantId: siteId } },
          },
          participants: {
            create: [
              {
                kind: "GUARDIAN",
                tenant: { connect: { id: siteId } },
                user: { connect: { id: guardianId } },
                guardianIdentity: {
                  connect: {
                    id_tenantId: { id: guardian.id, tenantId: siteId },
                  },
                },
              },
              {
                kind: "STAFF",
                tenant: { connect: { id: siteId } },
                user: { connect: { id: teacherId } },
              },
            ],
          },
        },
        select: { id: true },
      });
      parentConversationId = parentConversation.id;
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("limits staff messaging to current site staff despite permission tags", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    for (const name of ["teacher", "supervisor", "head"] as const) {
      const response = await request(server)
        .get(staffPath)
        .set("Authorization", authorization[name]);
      expect(response.status).toBe(200);
    }
    for (const name of ["support", "guardian", "student"] as const) {
      const response = await request(server)
        .get(staffPath)
        .set("Authorization", authorization[name]);
      expect([403, 404]).toContain(response.status);
      expect(JSON.stringify(response.body)).not.toContain("Ari Gate");
    }
  });

  it("denies student compose and parent messaging without a guardian relationship", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    const before = await prisma.messageConversation.count({
      where: { tenantId: siteId },
    });
    const staffAttempt = await request(server)
      .post(staffPath)
      .set("Authorization", authorization.student)
      .send({ kind: "STAFF_DIRECT", recipientUserId: teacherId });
    const parentAttempt = await request(server)
      .post(parentPath(siteId))
      .set("Authorization", authorization.student)
      .send({ recipientUserId: teacherId });
    expect([403, 404]).toContain(staffAttempt.status);
    expect(parentAttempt.status).toBe(404);
    expect(
      await prisma.messageConversation.count({ where: { tenantId: siteId } }),
    ).toBe(before);
  });

  it("hides foreign and unjoined conversation IDs from staff and guardians", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    const staffMessages = `${staffPath}/${staffConversationId}/messages`;
    const parentMessages = `${parentPath(siteId)}/${parentConversationId}/messages`;
    expect(
      (
        await request(server)
          .get(staffMessages)
          .set("Authorization", authorization.teacher)
      ).status,
    ).toBe(200);
    expect(
      (
        await request(server)
          .get(parentMessages)
          .set("Authorization", authorization.guardian)
      ).status,
    ).toBe(200);
    for (const name of ["supervisor", "otherSiteStaff"] as const) {
      const response = await request(server)
        .get(staffMessages)
        .set("Authorization", authorization[name]);
      expect(response.status).toBe(404);
    }
    for (const name of ["otherGuardian", "student"] as const) {
      const response = await request(server)
        .get(parentMessages)
        .set("Authorization", authorization[name]);
      expect(response.status).toBe(404);
    }
    const wrongSite = await request(server)
      .get(`${parentPath(otherSiteId)}/${parentConversationId}/messages`)
      .set("Authorization", authorization.guardian);
    expect(wrongSite.status).toBe(404);
  });

  it("removes family messaging when the parent portal or relationship ends", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    const path = parentPath(siteId);
    const linked = await request(server)
      .get(path)
      .set("Authorization", authorization.guardian);
    expect(linked.status).toBe(200);
    await prisma.org.update({
      where: { id: orgId },
      data: { parentPortalEnabled: false },
    });
    try {
      const disabled = await request(server)
        .get(path)
        .set("Authorization", authorization.guardian);
      expect(disabled.status).toBe(404);
    } finally {
      await prisma.org.update({
        where: { id: orgId },
        data: { parentPortalEnabled: true },
      });
    }
    await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.guardianChildRelationship.updateMany({
        where: { tenantId: siteId, guardianIdentityId },
        data: { endedAt: new Date() },
      }),
    );
    const ended = await request(server)
      .get(path)
      .set("Authorization", authorization.guardian);
    expect(ended.status).toBe(404);
  });
});
