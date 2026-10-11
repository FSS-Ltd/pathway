import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma, withTenantRlsContext } from "@pathway/db";
import request from "supertest";
import { AceNoticeParentInboxService } from "../../ace-notices/ace-notice-parent-inbox.service";
import { AppModule } from "../../app.module";
import { ParentMessagingService } from "../../messaging/parent-messaging.service";
import { requireDatabase, seedE2eAuthUser } from "../../../test-helpers.e2e";

const orgId = randomUUID();
const siteId = randomUUID();
const otherSiteId = randomUUID();
const childId = randomUUID();
const siblingId = randomUUID();
const endedChildId = randomUUID();
const otherChildId = randomUUID();
const guardianUserId = randomUUID();
const limitedUserId = randomUUID();
const unrelatedUserId = randomUUID();
const recorderUserId = randomUUID();
const today = new Date(
  `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`,
);
const yesterday = new Date(today.getTime() - 86_400_000);
const route = (site: string, child: string) =>
  `/ace/family/sites/${site}/children/${child}/summary`;

describe("ACE family read facade", () => {
  let app: INestApplication | undefined;
  let guardianAuthorization = "";
  let limitedAuthorization = "";
  let unrelatedAuthorization = "";
  let staffAuthorization = "";

  beforeAll(async () => {
    if (!requireDatabase()) return;
    await prisma.org.create({
      data: {
        id: orgId,
        name: `Family facade ${orgId}`,
        slug: `family-facade-${orgId}`,
        planCode: "trial",
      },
    });
    await prisma.orgVertical.create({
      data: { orgId, vertical: "ACE_SCHOOL" },
    });
    await prisma.tenant.createMany({
      data: [siteId, otherSiteId].map((id) => ({
        id,
        orgId,
        name: `Family facade site ${id}`,
        slug: `family-facade-${id}`,
        timezone: "Europe/London",
      })),
    });
    guardianAuthorization = (
      await seedE2eAuthUser({
        subject: `family-facade-guardian-${guardianUserId}`,
        userId: guardianUserId,
        tenantId: siteId,
      })
    ).authorization;
    limitedAuthorization = (
      await seedE2eAuthUser({
        subject: `family-facade-limited-${limitedUserId}`,
        userId: limitedUserId,
        tenantId: siteId,
      })
    ).authorization;
    unrelatedAuthorization = (
      await seedE2eAuthUser({
        subject: `family-facade-unrelated-${unrelatedUserId}`,
        userId: unrelatedUserId,
        tenantId: siteId,
      })
    ).authorization;
    staffAuthorization = (
      await seedE2eAuthUser({
        subject: `family-facade-recorder-${recorderUserId}`,
        userId: recorderUserId,
        tenantId: siteId,
        siteRole: "SITE_ADMIN",
        orgId,
        orgRole: "ORG_MEMBER",
      })
    ).authorization;

    await withTenantRlsContext(siteId, orgId, async (tx) => {
      const academicYearId = randomUUID();
      const yearBandId = randomUUID();
      await tx.academicYear.create({
        data: {
          id: academicYearId,
          tenantId: siteId,
          name: "Family facade year",
          startsOn: new Date(today.getTime() - 30 * 86_400_000),
          endsOn: new Date(today.getTime() + 30 * 86_400_000),
          status: "ARCHIVED",
        },
      });
      await tx.aceYearBand.create({
        data: { id: yearBandId, tenantId: siteId, name: "Year 5" },
      });
      await tx.aceTeachingDate.create({
        data: {
          tenantId: siteId,
          academicYearId,
          date: yesterday,
          kind: "TEACHING",
        },
      });
      await tx.child.createMany({
        data: [
          { id: childId, firstName: "Ari", lastName: "Alpha" },
          { id: siblingId, firstName: "Bea", lastName: "Alpha" },
          { id: endedChildId, firstName: "Cal", lastName: "Alpha" },
        ].map((child) => ({ ...child, tenantId: siteId })),
      });
      await tx.aceSchoolEnrollment.createMany({
        data: [
          { childId, endsOn: null },
          { childId: siblingId, endsOn: null },
          { childId: endedChildId, endsOn: yesterday },
        ].map((enrollment) => ({
          ...enrollment,
          tenantId: siteId,
          academicYearId,
          yearBandId,
          startsOn: new Date(today.getTime() - 30 * 86_400_000),
        })),
      });
      await tx.aceDailyAttendance.create({
        data: {
          tenantId: siteId,
          childId,
          date: yesterday,
          status: "ABSENT",
          absenceReason: "SICK",
          recordedByUserId: recorderUserId,
        },
      });
      const guardian = await tx.guardianIdentity.create({
        data: { tenantId: siteId, userId: guardianUserId },
      });
      const limited = await tx.guardianIdentity.create({
        data: { tenantId: siteId, userId: limitedUserId },
      });
      await tx.guardianChildRelationship.createMany({
        data: [
          ...[childId, siblingId, endedChildId].map((id) => ({
            tenantId: siteId,
            guardianIdentityId: guardian.id,
            childId: id,
            legalAccess: "FULL" as const,
          })),
          {
            tenantId: siteId,
            guardianIdentityId: limited.id,
            childId,
            legalAccess: "LIMITED" as const,
          },
        ],
      });
    });
    await withTenantRlsContext(otherSiteId, orgId, async (tx) => {
      await tx.child.create({
        data: {
          id: otherChildId,
          tenantId: otherSiteId,
          firstName: "Other",
          lastName: "Child",
        },
      });
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

  it("returns separate released projections for two linked children", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    const first = await request(server)
      .get(route(siteId, childId))
      .set("Authorization", guardianAuthorization);
    const second = await request(server)
      .get(route(siteId, siblingId))
      .set("Authorization", guardianAuthorization);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.childName).toBe("Ari Alpha");
    expect(second.body.childName).toBe("Bea Alpha");
    expect(first.body.sections.attendance).toMatchObject({
      status: "ready",
      data: {
        counts: { present: 0, absent: 1, late: 0 },
        items: [{ status: "ABSENT", absenceReason: "SICK" }],
      },
    });
    expect(second.body.sections.attendance).toMatchObject({
      status: "ready",
      data: { counts: { present: 0, absent: 0, late: 0 }, items: [] },
    });
    expect(first.body.sections.notices.status).toBe("ready");
    expect(first.body.sections.messages.status).toBe("ready");
    for (const section of [
      "homework",
      "reports",
      "slips",
      "faith",
      "finance",
    ]) {
      expect(first.body.sections[section]).toEqual({ status: "unavailable" });
    }
    expect(JSON.stringify(first.body)).not.toContain(recorderUserId);
    const contexts = await request(server)
      .get("/ace/family/contexts")
      .set("Authorization", guardianAuthorization);
    expect(contexts.status).toBe(200);
    const parentContexts = contexts.body.items.filter(
      (item: { kind: string; siteId: string }) =>
        item.kind === "parent" && item.siteId === siteId,
    );
    expect(parentContexts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          childId,
          sections: expect.arrayContaining(["ace-summary"]),
        }),
        expect.objectContaining({
          childId: siblingId,
          sections: expect.arrayContaining(["ace-summary"]),
        }),
      ]),
    );
    expect(
      parentContexts.find(
        (item: { childId: string }) => item.childId === endedChildId,
      )?.sections,
    ).not.toContain("ace-summary");
  });

  it("denies limited, unrelated, ended-enrolment, supplied-child, and anonymous reads", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    for (const [authorization, site, child] of [
      [limitedAuthorization, siteId, childId],
      [unrelatedAuthorization, siteId, childId],
      [guardianAuthorization, siteId, endedChildId],
      [guardianAuthorization, siteId, otherChildId],
      [guardianAuthorization, otherSiteId, otherChildId],
    ]) {
      const response = await request(server)
        .get(route(site, child))
        .set("Authorization", authorization);
      expect(response.status).toBe(404);
    }
    expect((await request(server).get(route(siteId, childId))).status).toBe(
      401,
    );
  });

  it("denies staff and a guardian account with a student identity", async () => {
    if (!app) return;
    const staff = await request(app.getHttpServer())
      .get(route(siteId, childId))
      .set("Authorization", staffAuthorization);
    expect(staff.status).toBe(404);

    const student = await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.studentIdentity.create({
        data: { tenantId: siteId, userId: guardianUserId },
      }),
    );
    try {
      const response = await request(app.getHttpServer())
        .get(route(siteId, childId))
        .set("Authorization", guardianAuthorization);
      expect(response.status).toBe(404);
    } finally {
      await withTenantRlsContext(siteId, orgId, (tx) =>
        tx.studentIdentity.delete({ where: { id: student.id } }),
      );
    }
  });

  it("denies a disabled parent portal and inactive guardian account", async () => {
    if (!app) return;
    await prisma.org.update({
      where: { id: orgId },
      data: { parentPortalEnabled: false },
    });
    try {
      const response = await request(app.getHttpServer())
        .get(route(siteId, childId))
        .set("Authorization", guardianAuthorization);
      expect(response.status).toBe(404);
    } finally {
      await prisma.org.update({
        where: { id: orgId },
        data: { parentPortalEnabled: true },
      });
    }

    await prisma.user.update({
      where: { id: guardianUserId },
      data: { isActive: false },
    });
    try {
      const response = await request(app.getHttpServer())
        .get(route(siteId, childId))
        .set("Authorization", guardianAuthorization);
      expect(response.status).toBe(404);
    } finally {
      await prisma.user.update({
        where: { id: guardianUserId },
        data: { isActive: true },
      });
    }
  });

  it("removes access after a relationship is revoked", async () => {
    if (!app) return;
    const relationship = await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.guardianChildRelationship.findFirstOrThrow({
        where: {
          tenantId: siteId,
          childId,
          guardianIdentity: { userId: guardianUserId },
        },
        select: { id: true },
      }),
    );
    await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.guardianChildRelationship.update({
        where: { id: relationship.id },
        data: {
          revokedAt: new Date(),
          revokedByUserId: recorderUserId,
          revocationReason: "Access review test",
        },
      }),
    );
    try {
      const response = await request(app.getHttpServer())
        .get(route(siteId, childId))
        .set("Authorization", guardianAuthorization);
      expect(response.status).toBe(404);
    } finally {
      await withTenantRlsContext(siteId, orgId, (tx) =>
        tx.guardianChildRelationship.update({
          where: { id: relationship.id },
          data: {
            revokedAt: null,
            revokedByUserId: null,
            revocationReason: null,
          },
        }),
      );
    }
  });

  it("isolates a failed section without exposing the internal error", async () => {
    if (!app) return;
    const messaging = app.get(ParentMessagingService);
    const spy = jest
      .spyOn(messaging, "list")
      .mockRejectedValueOnce(new Error("private database detail"));
    try {
      const response = await request(app.getHttpServer())
        .get(route(siteId, childId))
        .set("Authorization", guardianAuthorization);
      expect(response.status).toBe(200);
      expect(response.body.sections.messages).toMatchObject({
        status: "error",
      });
      expect(response.body.sections.attendance.status).toBe("ready");
      expect(JSON.stringify(response.body)).not.toContain(
        "private database detail",
      );
    } finally {
      spy.mockRestore();
    }
  });

  it("returns only the released school-level notice and message fields", async () => {
    if (!app) return;
    const notices = app.get(AceNoticeParentInboxService);
    const messaging = app.get(ParentMessagingService);
    const noticeSpy = jest.spyOn(notices, "list").mockResolvedValueOnce({
      items: [
        {
          id: "notice-one",
          title: "School update",
          publishedAt: new Date(),
          expiresAt: null,
          deliveredAt: new Date(),
          readAt: null,
          requiresAcknowledgement: true,
          acknowledgedAt: null,
        },
      ],
      nextCursor: null,
    });
    const messageSpy = jest.spyOn(messaging, "list").mockResolvedValueOnce({
      items: [
        {
          id: "conversation-one",
          kind: "PARENT_STAFF",
          title: "School team",
          latestMessage: {
            preview: "private message preview",
            createdAt: new Date().toISOString(),
          },
          updatedAt: new Date().toISOString(),
          unreadCount: 2,
        },
      ],
      nextCursor: null,
    });
    try {
      const response = await request(app.getHttpServer())
        .get(route(siteId, childId))
        .set("Authorization", guardianAuthorization);
      expect(response.status).toBe(200);
      expect(response.body.sections.notices.data).toEqual({
        items: [{ id: "notice-one", title: "School update" }],
      });
      expect(response.body.sections.messages.data).toEqual({ unreadCount: 2 });
      expect(JSON.stringify(response.body)).not.toContain(
        "private message preview",
      );
      expect(JSON.stringify(response.body)).not.toContain("deliveredAt");
    } finally {
      noticeSpy.mockRestore();
      messageSpy.mockRestore();
    }
  });

  it("can disable one facade section without disabling the others", async () => {
    if (!app) return;
    const previous = process.env.ACE_FAMILY_FACADE_NOTICES_ENABLED;
    process.env.ACE_FAMILY_FACADE_NOTICES_ENABLED = "false";
    const noticeSpy = jest.spyOn(app.get(AceNoticeParentInboxService), "list");
    try {
      const response = await request(app.getHttpServer())
        .get(route(siteId, childId))
        .set("Authorization", guardianAuthorization);
      expect(response.status).toBe(200);
      expect(response.body.sections.notices).toEqual({ status: "unavailable" });
      expect(response.body.sections.attendance.status).toBe("ready");
      expect(response.body.sections.messages.status).toBe("ready");
      expect(noticeSpy).not.toHaveBeenCalled();
    } finally {
      noticeSpy.mockRestore();
      if (previous === undefined) {
        delete process.env.ACE_FAMILY_FACADE_NOTICES_ENABLED;
      } else {
        process.env.ACE_FAMILY_FACADE_NOTICES_ENABLED = previous;
      }
    }
  });
});
