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
      await tx.accessTagGrant.create({
        data: {
          orgId,
          tenantId: siteId,
          userId: teacherId,
          tagKey: "PARENT_MESSAGE_RESPONDER",
          grantedById: headId,
          startsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      });
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

  it("denies sends and read cursors for unjoined or wrong-site conversations", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    const staffConversation = `${staffPath}/${staffConversationId}`;
    const parentConversation = `${parentPath(siteId)}/${parentConversationId}`;
    const wrongSiteConversation = `${parentPath(otherSiteId)}/${parentConversationId}`;
    const beforeMessages = await prisma.message.count({
      where: { tenantId: siteId },
    });
    const beforeCursors = await prisma.messageParticipantReadCursor.count({
      where: { tenantId: siteId },
    });

    for (const [actor, path] of [
      ["supervisor", staffConversation],
      ["otherSiteStaff", staffConversation],
      ["otherGuardian", parentConversation],
      ["guardian", wrongSiteConversation],
    ] as const) {
      const send = await request(server)
        .post(`${path}/messages`)
        .set("Authorization", authorization[actor])
        .send({ clientRequestId: randomUUID(), body: "Private message" });
      const read = await request(server)
        .put(`${path}/read-cursor`)
        .set("Authorization", authorization[actor])
        .send({ sequence: 1 });
      expect(send.status).toBe(404);
      expect(read.status).toBe(404);
    }
    expect(await prisma.message.count({ where: { tenantId: siteId } })).toBe(
      beforeMessages,
    );
    expect(
      await prisma.messageParticipantReadCursor.count({
        where: { tenantId: siteId },
      }),
    ).toBe(beforeCursors);
  });

  it("rejects a message sequence from another conversation before advancing a cursor", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    const staffConversation = `${staffPath}/${staffConversationId}`;
    const parentConversation = `${parentPath(siteId)}/${parentConversationId}`;
    for (const [actor, path] of [
      ["teacher", staffConversation],
      ["guardian", parentConversation],
    ] as const) {
      const response = await request(server)
        .post(`${path}/messages`)
        .set("Authorization", authorization[actor])
        .send({ clientRequestId: randomUUID(), body: "First message" });
      expect(response.status).toBe(200);
    }
    const secondParentMessage = await request(server)
      .post(`${parentConversation}/messages`)
      .set("Authorization", authorization.guardian)
      .send({ clientRequestId: randomUUID(), body: "Second message" });
    expect(secondParentMessage.status).toBe(200);

    const wrongSequence = await request(server)
      .put(`${staffConversation}/read-cursor`)
      .set("Authorization", authorization.teacher)
      .send({ sequence: 2 });
    expect(wrongSequence.status).toBe(400);
    expect(
      await prisma.messageParticipantReadCursor.count({
        where: { tenantId: siteId, conversationId: staffConversationId },
      }),
    ).toBe(0);
  });

  it("denies disabled staff and guardian accounts on direct message routes", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    const beforeMessages = await prisma.message.count({
      where: { tenantId: siteId },
    });
    const beforeCursors = await prisma.messageParticipantReadCursor.count({
      where: { tenantId: siteId },
    });
    for (const [actor, userId, path] of [
      ["teacher", teacherId, `${staffPath}/${staffConversationId}`],
      ["guardian", guardianId, `${parentPath(siteId)}/${parentConversationId}`],
    ] as const) {
      await prisma.user.update({
        where: { id: userId },
        data: { isActive: false },
      });
      try {
        const history = await request(server)
          .get(`${path}/messages`)
          .set("Authorization", authorization[actor]);
        const send = await request(server)
          .post(`${path}/messages`)
          .set("Authorization", authorization[actor])
          .send({ clientRequestId: randomUUID(), body: "Blocked message" });
        const read = await request(server)
          .put(`${path}/read-cursor`)
          .set("Authorization", authorization[actor])
          .send({ sequence: 1 });
        for (const response of [history, send, read]) {
          expect([401, 403, 404]).toContain(response.status);
        }
      } finally {
        await prisma.user.update({
          where: { id: userId },
          data: { isActive: true },
        });
      }
    }
    expect(await prisma.message.count({ where: { tenantId: siteId } })).toBe(
      beforeMessages,
    );
    expect(
      await prisma.messageParticipantReadCursor.count({
        where: { tenantId: siteId },
      }),
    ).toBe(beforeCursors);
  });

  it("removes family messaging when the parent portal or relationship ends", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    const path = parentPath(siteId);
    const linked = await request(server)
      .get(path)
      .set("Authorization", authorization.guardian);
    expect(linked.status).toBe(200);
    const unavailableRoutes = [
      () => request(server).get(path),
      () => request(server).get(`${path}/${parentConversationId}/messages`),
      () =>
        request(server)
          .post(`${path}/${parentConversationId}/messages`)
          .send({ clientRequestId: randomUUID(), body: "Blocked message" }),
      () =>
        request(server)
          .put(`${path}/${parentConversationId}/read-cursor`)
          .send({ sequence: 1 }),
    ];
    const expectUnavailable = async () => {
      for (const makeRequest of unavailableRoutes) {
        const response = await makeRequest().set(
          "Authorization",
          authorization.guardian,
        );
        expect(response.status).toBe(404);
      }
    };
    const beforeMessages = await prisma.message.count({
      where: { tenantId: siteId, conversationId: parentConversationId },
    });
    await prisma.org.update({
      where: { id: orgId },
      data: { parentPortalEnabled: false },
    });
    try {
      await expectUnavailable();
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
    await expectUnavailable();
    expect(
      await prisma.message.count({
        where: { tenantId: siteId, conversationId: parentConversationId },
      }),
    ).toBe(beforeMessages);
  });

  it("denies a removed staff member even when their messaging tag remains", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    const messageCount = await prisma.message.count({
      where: { tenantId: siteId, conversationId: staffConversationId },
    });
    await prisma.siteMembership.delete({
      where: { tenantId_userId: { tenantId: siteId, userId: teacherId } },
    });
    try {
      const paths = [
        staffPath,
        `${staffPath}/recipients`,
        `${staffPath}/school-team`,
        `${staffPath}/${staffConversationId}/messages`,
      ];
      for (const path of paths) {
        const response = await request(server)
          .get(path)
          .set("Authorization", authorization.teacher);
        expect([403, 404]).toContain(response.status);
      }
      const send = await request(server)
        .post(`${staffPath}/${staffConversationId}/messages`)
        .set("Authorization", authorization.teacher)
        .send({
          clientRequestId: randomUUID(),
          body: "A former member must not send this",
        });
      expect([403, 404]).toContain(send.status);
      const read = await request(server)
        .put(`${staffPath}/${staffConversationId}/read-cursor`)
        .set("Authorization", authorization.teacher)
        .send({ sequence: 1 });
      expect([403, 404]).toContain(read.status);
      expect(
        await prisma.message.count({
          where: { tenantId: siteId, conversationId: staffConversationId },
        }),
      ).toBe(messageCount);
    } finally {
      await prisma.siteMembership.create({
        data: { tenantId: siteId, userId: teacherId, role: "STAFF" },
      });
    }
  });
});
