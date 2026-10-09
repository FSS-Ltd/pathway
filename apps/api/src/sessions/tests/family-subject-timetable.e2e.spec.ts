import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma, withTenantRlsContext } from "@pathway/db";
import request from "supertest";
import { AppModule } from "../../app.module";
import { createSubjectTimetableFixture } from "../../ace-settings/tests/ace-subject-timetable.fixture";
import {
  clearE2eAuthAccess,
  isDatabaseAvailable,
  requireDatabase,
  seedE2eAuthUser,
} from "../../../test-helpers.e2e";

const orgId = randomUUID();
const siteId = randomUUID();
const otherSiteId = randomUUID();
const parentId = randomUUID();
const limitedParentId = randomUUID();
const studentId = randomUUID();

describe("ACE family subject timetable", () => {
  let app: INestApplication | undefined;
  let fixture: Awaited<ReturnType<typeof createSubjectTimetableFixture>>;
  let parentAuth = "";
  let limitedAuth = "";
  let studentAuth = "";
  let relationshipId = "";
  let studentLinkId = "";

  beforeAll(async () => {
    if (!requireDatabase()) return;
    await prisma.org.create({
      data: {
        id: orgId,
        name: `Family subject timetable ${orgId}`,
        slug: `family-subject-${orgId}`,
        planCode: "trial",
        parentPortalEnabled: true,
      },
    });
    await prisma.tenant.createMany({
      data: [siteId, otherSiteId].map((id) => ({
        id,
        orgId,
        name: `Family subject site ${id}`,
        slug: `family-subject-${id}`,
        timezone: "Europe/London",
      })),
    });
    await prisma.orgVertical.create({
      data: { orgId, vertical: "ACE_SCHOOL" },
    });
    parentAuth = (
      await seedE2eAuthUser({
        subject: `family-subject-parent-${parentId}`,
        userId: parentId,
        tenantId: siteId,
      })
    ).authorization;
    limitedAuth = (
      await seedE2eAuthUser({
        subject: `family-subject-limited-${limitedParentId}`,
        userId: limitedParentId,
        tenantId: siteId,
      })
    ).authorization;
    studentAuth = (
      await seedE2eAuthUser({
        subject: `family-subject-student-${studentId}`,
        userId: studentId,
        tenantId: siteId,
      })
    ).authorization;
    fixture = await withTenantRlsContext(siteId, orgId, async (tx) => {
      const created = await createSubjectTimetableFixture(tx, siteId);
      const guardian = await tx.guardianIdentity.create({
        data: { tenantId: siteId, userId: parentId },
      });
      const relationship = await tx.guardianChildRelationship.create({
        data: {
          tenantId: siteId,
          guardianIdentityId: guardian.id,
          childId: created.childId,
          legalAccess: "FULL",
        },
      });
      relationshipId = relationship.id;
      const limited = await tx.guardianIdentity.create({
        data: { tenantId: siteId, userId: limitedParentId },
      });
      await tx.guardianChildRelationship.create({
        data: {
          tenantId: siteId,
          guardianIdentityId: limited.id,
          childId: created.childId,
          legalAccess: "LIMITED",
        },
      });
      const student = await tx.studentIdentity.create({
        data: { tenantId: siteId, userId: studentId },
      });
      await tx.studentPortalPolicy.create({
        data: { tenantId: siteId, studentPortalEnabled: true },
      });
      const link = await tx.studentIdentityLink.create({
        data: {
          tenantId: siteId,
          studentIdentityId: student.id,
          childId: created.childId,
        },
      });
      studentLinkId = link.id;
      return created;
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (!isDatabaseAvailable()) return;
    for (const userId of [parentId, limitedParentId, studentId]) {
      await clearE2eAuthAccess(userId);
    }
  });

  function parentPath(periodId?: string): string {
    const path = `/ace/parent/sites/${siteId}/children/${fixture.childId}/subject-timetable`;
    return periodId ? `${path}/${periodId}` : path;
  }

  function studentPath(periodId?: string): string {
    const path = `/ace/student/sites/${siteId}/subject-timetable`;
    return periodId ? `${path}/${periodId}` : path;
  }

  it("returns only the issued snapshot to a linked parent and student", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    expect((await request(server).get(parentPath())).status).toBe(401);
    for (const [path, auth] of [
      [parentPath(), parentAuth],
      [studentPath(), studentAuth],
    ]) {
      const list = await request(server).get(path).set("Authorization", auth);
      expect(list.status).toBe(200);
      expect(list.body.items).toEqual([
        expect.objectContaining({
          periodId: fixture.schedule.academicPeriodId,
          publicationId: fixture.publication.id,
        }),
      ]);
      const detail = await request(server)
        .get(`${path}/${fixture.schedule.academicPeriodId}`)
        .set("Authorization", auth);
      expect(detail.status).toBe(200);
      expect(detail.body.entries).toEqual([
        expect.objectContaining({ day: "TUESDAY", subjectName: "Reading" }),
      ]);
      for (const privateField of [
        "draftId",
        "draftVersion",
        "publishedByUserId",
        "withdrawalReason",
      ]) {
        expect(detail.body).not.toHaveProperty(privateField);
      }
      expect(detail.body.entries[0]).not.toHaveProperty("subjectId");
    }
  });

  it("returns the same not-found response for limited, cross-site, and unpublished access", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    const periodId = fixture.schedule.academicPeriodId;
    const denied = [
      [parentPath(periodId), limitedAuth],
      [
        `/ace/parent/sites/${otherSiteId}/children/${fixture.childId}/subject-timetable/${periodId}`,
        parentAuth,
      ],
      [parentPath(randomUUID()), parentAuth],
      [studentPath(randomUUID()), studentAuth],
    ];
    for (const [path, auth] of denied) {
      const response = await request(server)
        .get(path)
        .set("Authorization", auth);
      expect(response.status).toBe(404);
      expect(response.body.message).toBe("Timetable not found");
    }
  });

  it("rechecks portal switches and live links on every read", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    await prisma.org.update({
      where: { id: orgId },
      data: { parentPortalEnabled: false },
    });
    expect(
      (await request(server).get(parentPath()).set("Authorization", parentAuth))
        .status,
    ).toBe(404);
    await prisma.org.update({
      where: { id: orgId },
      data: { parentPortalEnabled: true },
    });
    await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.studentPortalPolicy.update({
        where: { tenantId: siteId },
        data: { studentPortalEnabled: false },
      }),
    );
    expect(
      (
        await request(server)
          .get(studentPath())
          .set("Authorization", studentAuth)
      ).status,
    ).toBe(404);
    await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.studentPortalPolicy.update({
        where: { tenantId: siteId },
        data: { studentPortalEnabled: true },
      }),
    );
    await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.guardianChildRelationship.update({
        where: { id: relationshipId },
        data: { revokedAt: new Date() },
      }),
    );
    expect(
      (await request(server).get(parentPath()).set("Authorization", parentAuth))
        .status,
    ).toBe(404);
    await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.studentIdentityLink.update({
        where: { id: studentLinkId },
        data: { revokedAt: new Date() },
      }),
    );
    expect(
      (
        await request(server)
          .get(studentPath())
          .set("Authorization", studentAuth)
      ).status,
    ).toBe(404);
    await withTenantRlsContext(siteId, orgId, async (tx) => {
      await tx.guardianChildRelationship.update({
        where: { id: relationshipId },
        data: { revokedAt: null },
      });
      await tx.studentIdentityLink.update({
        where: { id: studentLinkId },
        data: { revokedAt: null },
      });
    });
  });

  it("does not reveal an older version when the latest is withdrawn", async () => {
    if (!app) return;
    await withTenantRlsContext(siteId, orgId, async (tx) => {
      await tx.aceStudentTimetableDraft.update({
        where: { id: fixture.draft.id },
        data: { version: 2 },
      });
      const newer = await tx.aceStudentTimetablePublication.create({
        data: {
          tenantId: siteId,
          draftId: fixture.draft.id,
          draftVersion: 2,
          childId: fixture.childId,
          academicPeriodId: fixture.schedule.academicPeriodId,
          periodName: "Autumn",
          periodStartsOn: new Date("2044-09-01T00:00:00.000Z"),
          periodEndsOn: new Date("2044-12-20T00:00:00.000Z"),
          yearBandName: "Year A",
          publishedByUserId: fixture.actorId,
        },
      });
      await tx.aceStudentTimetablePublicationEntry.create({
        data: {
          tenantId: siteId,
          publicationId: newer.id,
          day: "TUESDAY",
          slotPosition: 0,
          slotKind: "LESSON",
          slotLabel: "Morning",
          startMinutes: 540,
          endMinutes: 600,
          subjectName: "Revised reading",
        },
      });
      await tx.aceStudentTimetablePublication.update({
        where: { id: newer.id },
        data: { publishedAt: new Date() },
      });
      await tx.aceStudentTimetablePublication.update({
        where: { id: newer.id },
        data: {
          withdrawnAt: new Date(),
          withdrawnByUserId: fixture.actorId,
          withdrawalReason: "Correcting the grid",
        },
      });
    });
    const server = app.getHttpServer();
    const list = await request(server)
      .get(studentPath())
      .set("Authorization", studentAuth);
    expect(list.status).toBe(200);
    expect(list.body.items).toEqual([]);
    const detail = await request(server)
      .get(studentPath(fixture.schedule.academicPeriodId))
      .set("Authorization", studentAuth);
    expect(detail.status).toBe(404);
  });
});
