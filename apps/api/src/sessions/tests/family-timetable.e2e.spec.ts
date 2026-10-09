import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma, withTenantRlsContext } from "@pathway/db";
import request from "supertest";
import { AppModule } from "../../app.module";
import { requireDatabase, seedE2eAuthUser } from "../../../test-helpers.e2e";

const orgId = randomUUID();
const siteId = randomUUID();
const otherSiteId = randomUUID();
const groupId = randomUUID();
const childId = randomUUID();
const otherChildId = randomUUID();
const sessionId = randomUUID();
const parentId = randomUUID();
const limitedParentId = randomUUID();
const studentId = randomUUID();
const managerId = randomUUID();
const from = new Date("2026-10-12T00:00:00.000Z");
const to = new Date("2026-10-19T00:00:00.000Z");
const range = new URLSearchParams({
  from: from.toISOString(),
  to: to.toISOString(),
});
const parentRoute = `/ace/parent/sites/${siteId}/children/${childId}/timetable?${range}`;
const studentRoute = `/ace/student/sites/${siteId}/timetable?${range}`;

describe("ACE family session timetable", () => {
  let app: INestApplication | undefined;
  let parentAuth = "";
  let limitedAuth = "";
  let studentAuth = "";
  let managerAuth = "";

  beforeAll(async () => {
    if (!requireDatabase()) return;
    await prisma.org.create({
      data: {
        id: orgId,
        name: `Family timetable ${orgId}`,
        slug: `family-timetable-${orgId}`,
        planCode: "trial",
      },
    });
    await prisma.tenant.createMany({
      data: [siteId, otherSiteId].map((id) => ({
        id,
        orgId,
        name: `Timetable site ${id}`,
        slug: `timetable-${id}`,
        timezone: "Europe/London",
      })),
    });
    await prisma.orgVertical.create({
      data: { orgId, vertical: "ACE_SCHOOL" },
    });
    parentAuth = (
      await seedE2eAuthUser({
        subject: `timetable-parent-${parentId}`,
        userId: parentId,
        tenantId: siteId,
      })
    ).authorization;
    limitedAuth = (
      await seedE2eAuthUser({
        subject: `timetable-limited-${limitedParentId}`,
        userId: limitedParentId,
        tenantId: siteId,
      })
    ).authorization;
    studentAuth = (
      await seedE2eAuthUser({
        subject: `timetable-student-${studentId}`,
        userId: studentId,
        tenantId: siteId,
      })
    ).authorization;
    managerAuth = (
      await seedE2eAuthUser({
        subject: `timetable-manager-${managerId}`,
        userId: managerId,
        tenantId: siteId,
        siteRole: "SITE_ADMIN",
        orgId,
        orgRole: "ORG_MEMBER",
      })
    ).authorization;

    await withTenantRlsContext(siteId, orgId, async (tx) => {
      await tx.studentPortalPolicy.create({
        data: { tenantId: siteId, studentPortalEnabled: true },
      });
      await tx.group.create({
        data: {
          id: groupId,
          tenantId: siteId,
          name: "Year 5",
          minAge: 9,
          maxAge: 11,
        },
      });
      await tx.child.createMany({
        data: [childId, otherChildId].map((id) => ({
          id,
          tenantId: siteId,
          groupId,
          firstName: "Timetable",
          lastName: id,
        })),
      });
      await tx.session.create({
        data: {
          id: sessionId,
          tenantId: siteId,
          title: "Maths",
          startsAt: new Date("2026-10-13T09:00:00.000Z"),
          endsAt: new Date("2026-10-13T10:00:00.000Z"),
          groups: { connect: [{ id: groupId }] },
        },
      });
      for (const [userId, legalAccess] of [
        [parentId, "FULL"],
        [limitedParentId, "LIMITED"],
      ] as const) {
        const identity = await tx.guardianIdentity.create({
          data: { tenantId: siteId, userId },
        });
        await tx.guardianChildRelationship.create({
          data: {
            tenantId: siteId,
            guardianIdentityId: identity.id,
            childId,
            legalAccess,
          },
        });
      }
      const identity = await tx.studentIdentity.create({
        data: { tenantId: siteId, userId: studentId },
      });
      await tx.studentIdentityLink.create({
        data: { tenantId: siteId, studentIdentityId: identity.id, childId },
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

  it("keeps an unpublished session private, then shows it only to linked family and self", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    const before = await request(server)
      .get(parentRoute)
      .set("Authorization", parentAuth);
    expect(before.status).toBe(200);
    expect(before.body.items).toEqual([]);

    const deniedWrite = await request(server)
      .post(`/sessions/${sessionId}/family-publication`)
      .set("Authorization", parentAuth);
    expect(deniedWrite.status).toBe(403);
    const publish = await request(server)
      .post(`/sessions/${sessionId}/family-publication`)
      .set("Authorization", managerAuth);
    expect(publish.status).toBe(201);
    expect(publish.body.familyPublishedAt).toEqual(expect.any(String));

    for (const [route, authorization] of [
      [parentRoute, parentAuth],
      [studentRoute, studentAuth],
    ]) {
      const response = await request(server)
        .get(route)
        .set("Authorization", authorization);
      expect(response.status).toBe(200);
      expect(response.body.items).toEqual([
        expect.objectContaining({ id: sessionId, title: "Maths" }),
      ]);
      expect(response.body.items[0]).not.toHaveProperty("assignments");
    }
    const audit = await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.auditEvent.findFirst({
        where: {
          tenantId: siteId,
          entityId: sessionId,
          actorUserId: managerId,
        },
      }),
    );
    expect(audit?.metadata).toMatchObject({
      recordType: "Session",
      event: "published",
    });
  });

  it("denies limited and unrelated child or site access", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    const denied = await Promise.all([
      request(server).get(parentRoute).set("Authorization", limitedAuth),
      request(server)
        .get(
          `/ace/parent/sites/${siteId}/children/${otherChildId}/timetable?${range}`,
        )
        .set("Authorization", parentAuth),
      request(server)
        .get(
          `/ace/parent/sites/${otherSiteId}/children/${childId}/timetable?${range}`,
        )
        .set("Authorization", parentAuth),
      request(server).get(studentRoute).set("Authorization", parentAuth),
    ]);
    expect(denied.map((response) => response.status)).toEqual([
      404, 404, 404, 404,
    ]);
    expect((await request(server).get(parentRoute)).status).toBe(401);
    expect(
      (
        await request(server)
          .get(
            `/ace/parent/sites/${siteId}/children/${childId}/timetable?from=bad&to=bad`,
          )
          .set("Authorization", parentAuth)
      ).status,
    ).toBe(400);
  });

  it("requires unpublishing before editing and hides the session after removal", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    await request(server)
      .post(`/sessions/${sessionId}/family-publication`)
      .set("Authorization", managerAuth);
    const edit = await request(server)
      .patch(`/sessions/${sessionId}`)
      .set("Authorization", managerAuth)
      .send({ title: "Changed" });
    expect(edit.status).toBe(409);
    const remove = await request(server)
      .delete(`/sessions/${sessionId}`)
      .set("Authorization", managerAuth);
    expect(remove.status).toBe(409);
    const unpublish = await request(server)
      .delete(`/sessions/${sessionId}/family-publication`)
      .set("Authorization", managerAuth);
    expect(unpublish.status).toBe(200);
    expect(unpublish.body.familyPublishedAt).toBeNull();
    const after = await request(server)
      .get(studentRoute)
      .set("Authorization", studentAuth);
    expect(after.status).toBe(200);
    expect(after.body.items).toEqual([]);
  });
});
