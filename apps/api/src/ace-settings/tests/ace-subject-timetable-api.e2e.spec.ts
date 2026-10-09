import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma, withTenantRlsContext } from "@pathway/db";
import request from "supertest";
import {
  clearE2eAuthAccess,
  clearE2eTypedRole,
  isDatabaseAvailable,
  requireDatabase,
  seedE2eAuthUser,
  seedE2eTypedRole,
} from "../../../test-helpers.e2e";
import { AppModule } from "../../app.module";
import { createSubjectTimetableFixture } from "./ace-subject-timetable.fixture";

function requiredFixture(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Subject timetable API test requires ${name}`);
  return value;
}

const orgId = requiredFixture("E2E_ORG_ID");
const siteId = requiredFixture("E2E_TENANT_ID");
const otherSiteId = requiredFixture("E2E_TENANT2_ID");

describe("ACE subject timetable Head API", () => {
  let app: INestApplication | undefined;
  let managerAuthorization = "";
  let readerAuthorization = "";
  let otherSiteAuthorization = "";
  let fixture: Awaited<ReturnType<typeof createSubjectTimetableFixture>>;
  const readerId = randomUUID();
  const otherUserId = randomUUID();
  const roles: Array<{
    roleDefinitionId: string;
    assignmentId: string;
  }> = [];

  beforeAll(async () => {
    if (!requireDatabase()) return;
    fixture = await withTenantRlsContext(siteId, orgId, (tx) =>
      createSubjectTimetableFixture(tx, siteId),
    );
    const manager = await seedE2eAuthUser({
      subject: `ace-timetable-manager-${fixture.actorId}`,
      userId: fixture.actorId,
      tenantId: siteId,
      siteRole: "SITE_ADMIN",
      orgId,
      orgRole: "ORG_ADMIN",
    });
    const reader = await seedE2eAuthUser({
      subject: `ace-timetable-reader-${readerId}`,
      userId: readerId,
      tenantId: siteId,
      siteRole: "STAFF",
      orgId,
      orgRole: "ORG_MEMBER",
    });
    const other = await seedE2eAuthUser({
      subject: `ace-timetable-other-${otherUserId}`,
      userId: otherUserId,
      tenantId: otherSiteId,
      siteRole: "SITE_ADMIN",
      orgId,
      orgRole: "ORG_MEMBER",
    });
    managerAuthorization = manager.authorization;
    readerAuthorization = reader.authorization;
    otherSiteAuthorization = other.authorization;
    roles.push(
      await seedE2eTypedRole({
        orgId,
        tenantId: siteId,
        userId: fixture.actorId,
        scope: "site",
        permissionKeys: ["ace.settings.manage"],
      }),
      await seedE2eTypedRole({
        orgId,
        tenantId: siteId,
        userId: readerId,
        scope: "site",
        permissionKeys: ["ace.settings.read"],
      }),
      await seedE2eTypedRole({
        orgId,
        tenantId: otherSiteId,
        userId: otherUserId,
        scope: "site",
        permissionKeys: ["ace.settings.manage"],
      }),
    );
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (!isDatabaseAvailable() || !fixture) return;
    await app?.close();
    for (const role of roles) await clearE2eTypedRole(role, orgId);
    for (const userId of [fixture.actorId, readerId, otherUserId]) {
      await clearE2eAuthAccess(userId);
    }
    await prisma.user.deleteMany({
      where: { id: { in: [readerId, otherUserId] } },
    });
  });

  it("guards the site and permission before returning a schedule", async () => {
    if (!app) return;
    const path = `/ace/subject-timetable/periods/${fixture.schedule.academicPeriodId}/year-bands/${fixture.schedule.yearBandId}/schedule`;
    const anonymous = await request(app.getHttpServer()).get(path);
    expect(anonymous.status).toBe(401);
    const reader = await request(app.getHttpServer())
      .get(path)
      .set("Authorization", readerAuthorization);
    expect(reader.status).toBe(403);
    const otherSite = await request(app.getHttpServer())
      .get(path)
      .set("Authorization", otherSiteAuthorization);
    expect(otherSite.status).toBe(404);
    const manager = await request(app.getHttpServer())
      .get(path)
      .set("Authorization", managerAuthorization);
    expect(manager.status).toBe(200);
    expect(manager.body.schedule.id).toBe(fixture.schedule.id);
    expect(manager.body.schedule.slots).toHaveLength(1);
  });

  it("rejects stale schedules and unenrolled subjects, then issues an immutable version", async () => {
    if (!app) return;
    const base = `/ace/subject-timetable/periods/${fixture.schedule.academicPeriodId}/year-bands/${fixture.schedule.yearBandId}`;
    const schedule = await request(app.getHttpServer())
      .get(`${base}/schedule`)
      .set("Authorization", managerAuthorization);
    expect(schedule.status).toBe(200);
    const stale = await request(app.getHttpServer())
      .put(`${base}/schedule`)
      .set("Authorization", managerAuthorization)
      .send({
        expectedUpdatedAt: "2000-01-01T00:00:00.000Z",
        teachingDays: ["TUESDAY"],
        slots: [
          {
            id: fixture.slot.id,
            kind: "LESSON",
            label: "Morning",
            startMinutes: 540,
            endMinutes: 600,
          },
        ],
        reason: "Check conflict",
      });
    expect(stale.status).toBe(409);
    const revised = await request(app.getHttpServer())
      .put(`${base}/schedule`)
      .set("Authorization", managerAuthorization)
      .send({
        expectedUpdatedAt: schedule.body.schedule.updatedAt,
        teachingDays: ["TUESDAY"],
        slots: [
          {
            id: fixture.slot.id,
            kind: "LESSON",
            label: "Morning lesson",
            startMinutes: 540,
            endMinutes: 600,
          },
        ],
        reason: "Clarify the slot name",
      });
    expect(revised.status).toBe(200);
    expect(revised.body.slots[0].id).toBe(fixture.slot.id);

    const draftPath = `${base}/children/${fixture.childId}/draft`;
    const draftCommand = {
      scheduleId: fixture.schedule.id,
      scheduleUpdatedAt: revised.body.updatedAt,
      expectedVersion: 1,
      entries: [
        {
          day: "TUESDAY",
          slotId: fixture.slot.id,
          subjectId: fixture.entry.subjectId,
        },
      ],
      reason: "Set the student's subjects",
    };
    const unenrolled = await request(app.getHttpServer())
      .put(draftPath)
      .set("Authorization", managerAuthorization)
      .send(draftCommand);
    expect(unenrolled.status).toBe(400);

    const originalSubject = await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.subject.findUniqueOrThrow({ where: { id: fixture.entry.subjectId } }),
    );
    await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.studentSubjectEnrollment.create({
        data: {
          tenantId: siteId,
          childId: fixture.childId,
          subjectId: fixture.entry.subjectId,
          startsOn: new Date("2044-09-01T00:00:00.000Z"),
          status: "ACTIVE",
          startingPace: 1,
          currentPace: 1,
          targetPace: 1,
          recordedByUserId: fixture.actorId,
          reason: "Timetable integration test",
        },
      }),
    );
    const saved = await request(app.getHttpServer())
      .put(draftPath)
      .set("Authorization", managerAuthorization)
      .send(draftCommand);
    expect(saved.status).toBe(200);
    expect(saved.body.version).toBe(2);

    const publishPath = `${base}/children/${fixture.childId}/publish`;
    const issued = await request(app.getHttpServer())
      .post(publishPath)
      .set("Authorization", managerAuthorization)
      .send({
        expectedVersion: 2,
        scheduleUpdatedAt: revised.body.updatedAt,
        acknowledgeUnassigned: false,
        reason: "Issue the subject timetable",
      });
    expect(issued.status).toBe(201);
    expect(issued.body.publication.draftVersion).toBe(2);
    expect(issued.body.publication.entries[0].subjectName).toBe(
      originalSubject.name,
    );

    const repeated = await request(app.getHttpServer())
      .post(publishPath)
      .set("Authorization", managerAuthorization)
      .send({
        expectedVersion: 2,
        scheduleUpdatedAt: revised.body.updatedAt,
        acknowledgeUnassigned: false,
        reason: "Repeat request",
      });
    expect(repeated.status).toBe(409);

    const cleared = await request(app.getHttpServer())
      .put(draftPath)
      .set("Authorization", managerAuthorization)
      .send({
        ...draftCommand,
        expectedVersion: 2,
        entries: [],
        reason: "Leave one lesson unassigned",
      });
    expect(cleared.status).toBe(200);
    expect(cleared.body.version).toBe(3);
    const publishEmpty = {
      expectedVersion: 3,
      scheduleUpdatedAt: revised.body.updatedAt,
      acknowledgeUnassigned: false,
      reason: "Issue the revised timetable",
    };
    const unacknowledged = await request(app.getHttpServer())
      .post(publishPath)
      .set("Authorization", managerAuthorization)
      .send(publishEmpty);
    expect(unacknowledged.status).toBe(400);
    const revisedPublication = await request(app.getHttpServer())
      .post(publishPath)
      .set("Authorization", managerAuthorization)
      .send({ ...publishEmpty, acknowledgeUnassigned: true });
    expect(revisedPublication.status).toBe(201);
    expect(revisedPublication.body.unassignedLessonCount).toBe(1);

    await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.subject.update({
        where: { id: fixture.entry.subjectId },
        data: { name: `Renamed ${randomUUID()}` },
      }),
    );
    const publicationId = issued.body.publication.id as string;
    const published = await request(app.getHttpServer())
      .get(
        `/ace/subject-timetable/periods/${fixture.schedule.academicPeriodId}/children/${fixture.childId}/publications/${publicationId}`,
      )
      .set("Authorization", managerAuthorization);
    expect(published.status).toBe(200);
    expect(published.body.entries[0].subjectName).toBe(originalSubject.name);

    const withdrawalPath = `/ace/subject-timetable/periods/${fixture.schedule.academicPeriodId}/children/${fixture.childId}/withdraw`;
    const latestPublicationId = revisedPublication.body.publication
      .id as string;
    const withdrawn = await request(app.getHttpServer())
      .post(withdrawalPath)
      .set("Authorization", managerAuthorization)
      .send({ publicationId: latestPublicationId, reason: "Issued in error" });
    expect(withdrawn.status).toBe(201);
    expect(withdrawn.body.withdrawnAt).toBeTruthy();
    const repeatedWithdrawal = await request(app.getHttpServer())
      .post(withdrawalPath)
      .set("Authorization", managerAuthorization)
      .send({
        publicationId: latestPublicationId,
        reason: "Repeat withdrawal",
      });
    expect(repeatedWithdrawal.status).toBe(409);
    let cursor: string | null = null;
    let rosterStatus: string | undefined;
    for (let page = 0; page < 30 && !rosterStatus; page += 1) {
      const roster = await request(app.getHttpServer())
        .get(`${base}/roster?limit=50${cursor ? `&cursor=${cursor}` : ""}`)
        .set("Authorization", managerAuthorization);
      expect(roster.status).toBe(200);
      rosterStatus = (
        roster.body.items as Array<{ id: string; status: string }>
      ).find((item) => item.id === fixture.childId)?.status;
      cursor = roster.body.nextCursor as string | null;
      if (!cursor) break;
    }
    expect(rosterStatus).toBe("DRAFT");
  });
});
