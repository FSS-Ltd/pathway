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
import { siteCalendarDate } from "../homework-audience";

describe("ACE homework assignment commands", () => {
  const academicYearStart = new Date(
    Date.UTC(new Date().getUTCFullYear() - 1, 0, 1),
  );
  const academicYearEnd = new Date(
    Date.UTC(new Date().getUTCFullYear() + 2, 11, 31),
  );
  const dueAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const editedDueAt = new Date(Date.now() + 31 * 86_400_000).toISOString();
  const endedOn = new Date(Date.now() - 86_400_000);
  const invalidDueAt = new Date(
    academicYearEnd.getTime() + 86_400_000,
  ).toISOString();
  const orgId = randomUUID();
  const siteId = randomUUID();
  const otherSiteId = randomUUID();
  const userId = randomUUID();
  const otherSiteUserId = randomUUID();
  const academicYearId = randomUUID();
  const yearBandId = randomUUID();
  const otherYearBandId = randomUUID();
  const subjectId = randomUUID();
  const teacherId = randomUUID();
  const currentChildId = randomUUID();
  const endedChildId = randomUUID();
  const currentEnrollmentId = randomUUID();
  const endedEnrollmentId = randomUUID();
  let app: INestApplication | undefined;
  let authorization = "";
  let teacherAuthorization = "";
  let otherSiteAuthorization = "";
  let role: Awaited<ReturnType<typeof seedE2eTypedRole>> | undefined;
  let teacherRole: Awaited<ReturnType<typeof seedE2eTypedRole>> | undefined;
  let otherSiteRole: Awaited<ReturnType<typeof seedE2eTypedRole>> | undefined;
  const previousPublicationFlag = process.env.ACE_HOMEWORK_PUBLICATION_ENABLED;
  const previousCronSecret = process.env.CRON_SECRET;

  beforeAll(async () => {
    if (!requireDatabase()) return;
    process.env.ACE_HOMEWORK_PUBLICATION_ENABLED = "true";
    process.env.CRON_SECRET = "ace-c02-test-cron-secret";
    await prisma.org.create({
      data: {
        id: orgId,
        name: `ACE homework ${orgId}`,
        slug: `ace-homework-${orgId}`,
        planCode: "trial",
      },
    });
    await prisma.tenant.createMany({
      data: [siteId, otherSiteId].map((id) => ({
        id,
        orgId,
        name: `Homework school ${id}`,
        slug: `ace-homework-${id}`,
        timezone: "Europe/London",
      })),
    });
    await prisma.orgVertical.create({
      data: { orgId, vertical: "ACE_SCHOOL" },
    });
    authorization = (
      await seedE2eAuthUser({
        subject: `homework-manager-${userId}`,
        userId,
        tenantId: siteId,
        siteRole: "SITE_ADMIN",
        orgId,
        orgRole: "ORG_ADMIN",
      })
    ).authorization;
    teacherAuthorization = (
      await seedE2eAuthUser({
        subject: `homework-teacher-${teacherId}`,
        userId: teacherId,
        tenantId: siteId,
        siteRole: "STAFF",
        orgId,
        orgRole: "ORG_MEMBER",
      })
    ).authorization;
    otherSiteAuthorization = (
      await seedE2eAuthUser({
        subject: `homework-other-site-${otherSiteUserId}`,
        userId: otherSiteUserId,
        tenantId: otherSiteId,
        siteRole: "SITE_ADMIN",
        orgId,
        orgRole: "ORG_MEMBER",
      })
    ).authorization;
    role = await seedE2eTypedRole({
      orgId,
      tenantId: siteId,
      userId,
      scope: "site",
      permissionKeys: ["ace.homework.assignments.manage"],
    });
    teacherRole = await seedE2eTypedRole({
      orgId,
      tenantId: siteId,
      userId: teacherId,
      scope: "site",
      permissionKeys: ["ace.homework.assignments.manage"],
    });
    otherSiteRole = await seedE2eTypedRole({
      orgId,
      tenantId: otherSiteId,
      userId: otherSiteUserId,
      scope: "site",
      permissionKeys: ["ace.homework.assignments.manage"],
    });
    await withTenantRlsContext(siteId, orgId, async (tx) => {
      await tx.academicYear.create({
        data: {
          id: academicYearId,
          tenantId: siteId,
          name: "Homework test academic year",
          startsOn: academicYearStart,
          endsOn: academicYearEnd,
          status: "ACTIVE",
        },
      });
      await tx.aceYearBand.createMany({
        data: [
          { id: yearBandId, tenantId: siteId, name: "Year 5" },
          { id: otherYearBandId, tenantId: siteId, name: "Year 6" },
        ],
      });
      await tx.aceStaffYearBandAssignment.create({
        data: {
          tenantId: siteId,
          userId: teacherId,
          yearBandId,
          startsOn: academicYearStart,
        },
      });
      await tx.subject.create({
        data: { id: subjectId, tenantId: siteId, name: "Mathematics" },
      });
      await tx.child.createMany({
        data: [
          {
            id: currentChildId,
            tenantId: siteId,
            firstName: "Current",
            lastName: "Pupil",
          },
          {
            id: endedChildId,
            tenantId: siteId,
            firstName: "Ended",
            lastName: "Pupil",
          },
        ],
      });
      await tx.aceSchoolEnrollment.createMany({
        data: [
          {
            id: currentEnrollmentId,
            tenantId: siteId,
            childId: currentChildId,
            academicYearId,
            yearBandId,
            startsOn: academicYearStart,
          },
          {
            id: endedEnrollmentId,
            tenantId: siteId,
            childId: endedChildId,
            academicYearId,
            yearBandId,
            startsOn: academicYearStart,
            endsOn: endedOn,
          },
        ],
      });
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (previousPublicationFlag === undefined) {
      delete process.env.ACE_HOMEWORK_PUBLICATION_ENABLED;
    } else {
      process.env.ACE_HOMEWORK_PUBLICATION_ENABLED = previousPublicationFlag;
    }
    if (previousCronSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = previousCronSecret;
    }
    if (!isDatabaseAvailable()) return;
    await app?.close();
    await prisma.$executeRaw`TRUNCATE TABLE "AceHomeworkRecipient", "AceHomeworkAssignment"`;
    await prisma.aceStaffYearBandAssignment.deleteMany({
      where: { tenantId: siteId },
    });
    if (otherSiteRole) await clearE2eTypedRole(otherSiteRole, orgId);
    if (teacherRole) await clearE2eTypedRole(teacherRole, orgId);
    if (role) await clearE2eTypedRole(role, orgId);
    await prisma.aceSchoolEnrollment.deleteMany({
      where: { tenantId: siteId },
    });
    await prisma.child.deleteMany({ where: { tenantId: siteId } });
    await prisma.subject.deleteMany({ where: { tenantId: siteId } });
    await prisma.aceYearBand.deleteMany({ where: { tenantId: siteId } });
    await prisma.academicYear.deleteMany({ where: { tenantId: siteId } });
    await prisma.auditEvent.deleteMany({ where: { orgId } });
    await prisma.outboxEvent.deleteMany({ where: { orgId } });
    await clearE2eAuthAccess(userId);
    await clearE2eAuthAccess(teacherId);
    await clearE2eAuthAccess(otherSiteUserId);
    await prisma.user.deleteMany({
      where: { id: { in: [userId, teacherId, otherSiteUserId] } },
    });
    await prisma.orgVertical.deleteMany({ where: { orgId } });
    await prisma.tenant.deleteMany({
      where: { id: { in: [siteId, otherSiteId] } },
    });
    await prisma.org.delete({ where: { id: orgId } });
  });

  it("creates a site-scoped draft for an authorised ACE staff member", async () => {
    if (!app) return;
    const response = await request(app.getHttpServer())
      .post("/ace/homework/assignments")
      .set("Authorization", authorization)
      .send({
        title: "Fractions practice",
        instructions: "Complete exercises 1 to 5.",
        academicYearId,
        yearBandId,
        subjectId,
        dueAt: dueAt,
      });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      title: "Fractions practice",
      status: "DRAFT",
      academicYearId,
      yearBandId,
      subjectId,
    });
  });

  it("edits a draft while preserving its versioned audit history", async () => {
    if (!app) return;
    const created = await request(app.getHttpServer())
      .post("/ace/homework/assignments")
      .set("Authorization", authorization)
      .send({
        title: "Original fractions task",
        instructions: "Complete exercises 1 to 3.",
        academicYearId,
        yearBandId,
        subjectId,
        dueAt: dueAt,
      });
    expect(created.status).toBe(201);

    const edited = await request(app.getHttpServer())
      .patch(`/ace/homework/assignments/${created.body.id}`)
      .set("Authorization", authorization)
      .send({
        version: created.body.version,
        title: "Revised fractions task",
        instructions: "Complete exercises 1 to 5.",
        academicYearId,
        yearBandId,
        subjectId,
        dueAt: editedDueAt,
      });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({
      title: "Revised fractions task",
      version: created.body.version + 1,
      status: "DRAFT",
    });
    const audit = await prisma.auditEvent.findMany({
      where: { orgId, entityId: created.body.id },
      orderBy: { createdAt: "asc" },
    });
    expect(audit.map((entry) => entry.action)).toEqual(["CREATED", "UPDATED"]);
  });

  it("publishes once to the current class roster and freezes recipients", async () => {
    if (!app) return;
    const created = await request(app.getHttpServer())
      .post("/ace/homework/assignments")
      .set("Authorization", authorization)
      .send({
        title: "Class fractions task",
        instructions: "Complete the fractions sheet.",
        academicYearId,
        yearBandId,
        subjectId,
        dueAt: dueAt,
      });
    expect(created.status).toBe(201);

    const published = await request(app.getHttpServer())
      .post(`/ace/homework/assignments/${created.body.id}/publish`)
      .set("Authorization", authorization)
      .send({ version: created.body.version });
    expect(published.status).toBe(200);
    expect(published.body).toMatchObject({
      status: "PUBLISHED",
      recipientCount: 1,
    });
    const recipients = await prisma.aceHomeworkRecipient.findMany({
      where: { tenantId: siteId, assignmentId: created.body.id },
    });
    expect(recipients.map((row) => row.childId)).toEqual([currentChildId]);
    expect(recipients[0]?.enrollmentId).toBe(currentEnrollmentId);

    const repeated = await request(app.getHttpServer())
      .post(`/ace/homework/assignments/${created.body.id}/publish`)
      .set("Authorization", authorization)
      .send({ version: created.body.version });
    expect(repeated.status).toBe(200);
    expect(repeated.body.recipientCount).toBe(1);
    expect(
      await prisma.outboxEvent.count({
        where: {
          orgId,
          aggregateId: created.body.id,
          eventType: "ace.homework.assignment.published",
        },
      }),
    ).toBe(1);
  });

  it("keeps drafts private while the publication gate is off", async () => {
    if (!app) return;
    const created = await request(app.getHttpServer())
      .post("/ace/homework/assignments")
      .set("Authorization", authorization)
      .send({
        title: "Private release draft",
        instructions: "Keep this out of pupil views.",
        academicYearId,
        yearBandId,
        subjectId,
        dueAt,
      });
    expect(created.status).toBe(201);
    process.env.ACE_HOMEWORK_PUBLICATION_ENABLED = "false";
    try {
      const options = await request(app.getHttpServer())
        .get("/ace/homework/assignments/options")
        .set("Authorization", authorization);
      expect(options.body.publicationEnabled).toBe(false);
      const publish = await request(app.getHttpServer())
        .post(`/ace/homework/assignments/${created.body.id}/publish`)
        .set("Authorization", authorization)
        .send({ version: created.body.version });
      expect(publish.status).toBe(503);
      expect(
        await prisma.aceHomeworkRecipient.count({
          where: { assignmentId: created.body.id },
        }),
      ).toBe(0);
    } finally {
      process.env.ACE_HOMEWORK_PUBLICATION_ENABLED = "true";
    }
  });

  it("rejects a due time at the first instant after the academic year", async () => {
    if (!app) return;
    const response = await request(app.getHttpServer())
      .post("/ace/homework/assignments")
      .set("Authorization", authorization)
      .send({
        title: "Out of year task",
        instructions: "This due date is outside the year.",
        academicYearId,
        yearBandId,
        subjectId,
        dueAt: invalidDueAt,
      });
    expect(response.status).toBe(400);
  });

  it("schedules a draft for publication before its due time", async () => {
    if (!app) return;
    const created = await request(app.getHttpServer())
      .post("/ace/homework/assignments")
      .set("Authorization", authorization)
      .send({
        title: "Scheduled fractions task",
        instructions: "Complete the sheet when it appears.",
        academicYearId,
        yearBandId,
        subjectId,
        dueAt: dueAt,
      });
    expect(created.status).toBe(201);
    const scheduledAt = new Date(Date.now() + 60_000).toISOString();
    const scheduled = await request(app.getHttpServer())
      .post(`/ace/homework/assignments/${created.body.id}/schedule`)
      .set("Authorization", authorization)
      .send({ version: created.body.version, scheduledAt });
    expect(scheduled.status).toBe(200);
    expect(scheduled.body).toMatchObject({
      status: "SCHEDULED",
      scheduledAt,
      version: created.body.version + 1,
    });
    expect(
      await prisma.aceHomeworkRecipient.count({
        where: { tenantId: siteId, assignmentId: created.body.id },
      }),
    ).toBe(0);
  });

  it("cancels a scheduled assignment without creating recipients", async () => {
    if (!app) return;
    const created = await request(app.getHttpServer())
      .post("/ace/homework/assignments")
      .set("Authorization", authorization)
      .send({
        title: "Cancelled fractions task",
        instructions: "This task will be withdrawn.",
        academicYearId,
        yearBandId,
        subjectId,
        dueAt: dueAt,
      });
    expect(created.status).toBe(201);
    const scheduled = await request(app.getHttpServer())
      .post(`/ace/homework/assignments/${created.body.id}/schedule`)
      .set("Authorization", authorization)
      .send({
        version: created.body.version,
        scheduledAt: new Date(Date.now() + 60_000).toISOString(),
      });
    expect(scheduled.status).toBe(200);

    const cancelled = await request(app.getHttpServer())
      .post(`/ace/homework/assignments/${created.body.id}/cancel`)
      .set("Authorization", authorization)
      .send({
        version: scheduled.body.version,
        reason: "Task no longer needed",
      });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe("CANCELLED");
    expect(cancelled.body.cancelledAt).toBeTruthy();
    expect(
      await prisma.aceHomeworkRecipient.count({
        where: { tenantId: siteId, assignmentId: created.body.id },
      }),
    ).toBe(0);
  });

  it("publishes a due schedule through the authenticated runner", async () => {
    if (!app) return;
    const created = await request(app.getHttpServer())
      .post("/ace/homework/assignments")
      .set("Authorization", authorization)
      .send({
        title: "Due fractions task",
        instructions: "Complete the due task.",
        academicYearId,
        yearBandId,
        subjectId,
        dueAt: dueAt,
      });
    expect(created.status).toBe(201);
    const scheduled = await request(app.getHttpServer())
      .post(`/ace/homework/assignments/${created.body.id}/schedule`)
      .set("Authorization", authorization)
      .send({
        version: created.body.version,
        scheduledAt: new Date(Date.now() + 60_000).toISOString(),
      });
    expect(scheduled.status).toBe(200);
    await prisma.aceHomeworkAssignment.update({
      where: { id: created.body.id },
      data: { scheduledAt: new Date(Date.now() - 60_000) },
    });

    const run = await request(app.getHttpServer())
      .get("/internal/homework-schedules/run")
      .set("Authorization", `Bearer ${process.env.CRON_SECRET}`);
    expect(run.status).toBe(200);
    expect(run.body.published).toBe(1);
    expect(
      await prisma.aceHomeworkRecipient.count({
        where: { tenantId: siteId, assignmentId: created.body.id },
      }),
    ).toBe(1);
  });

  it("holds an invalidated schedule for review and lets staff repair the draft", async () => {
    if (!app) return;
    const created = await request(app.getHttpServer())
      .post("/ace/homework/assignments")
      .set("Authorization", authorization)
      .send({
        title: "Review task",
        instructions: "Check this before publication.",
        academicYearId,
        yearBandId,
        subjectId,
        dueAt,
      });
    expect(created.status).toBe(201);
    const scheduled = await request(app.getHttpServer())
      .post(`/ace/homework/assignments/${created.body.id}/schedule`)
      .set("Authorization", authorization)
      .send({
        version: created.body.version,
        scheduledAt: new Date(Date.now() + 60_000).toISOString(),
      });
    expect(scheduled.status).toBe(200);
    await prisma.aceHomeworkAssignment.update({
      where: { id: created.body.id },
      data: { scheduledAt: new Date(Date.now() - 60_000) },
    });
    await prisma.subject.update({
      where: { id: subjectId },
      data: { isActive: false },
    });
    try {
      const run = await request(app.getHttpServer())
        .get("/internal/homework-schedules/run")
        .set("Authorization", `Bearer ${process.env.CRON_SECRET}`);
      expect(run.status).toBe(200);
      expect(run.body.needsReview).toBe(1);
      const held = await prisma.aceHomeworkAssignment.findUniqueOrThrow({
        where: { id: created.body.id },
      });
      expect(held.status).toBe("NEEDS_REVIEW");
      expect(held.scheduleFailureReason).toBe("PUBLICATION_INPUT_CHANGED");
      expect(
        await prisma.aceHomeworkRecipient.count({
          where: { assignmentId: created.body.id },
        }),
      ).toBe(0);

      await prisma.subject.update({
        where: { id: subjectId },
        data: { isActive: true },
      });
      const repaired = await request(app.getHttpServer())
        .patch(`/ace/homework/assignments/${created.body.id}`)
        .set("Authorization", authorization)
        .send({
          version: held.version,
          title: "Reviewed task",
          instructions: "Check this before publication.",
          academicYearId,
          yearBandId,
          subjectId,
          dueAt,
        });
      expect(repaired.status).toBe(200);
      expect(repaired.body.status).toBe("DRAFT");
      expect(repaired.body.scheduledAt).toBeNull();
    } finally {
      await prisma.subject.update({
        where: { id: subjectId },
        data: { isActive: true },
      });
    }
  });

  it("holds a schedule when the class roster changes before publication", async () => {
    if (!app) return;
    const created = await request(app.getHttpServer())
      .post("/ace/homework/assignments")
      .set("Authorization", authorization)
      .send({
        title: "Roster snapshot task",
        instructions: "Do not add a newly enrolled pupil automatically.",
        academicYearId,
        yearBandId,
        subjectId,
        dueAt,
      });
    expect(created.status).toBe(201);
    const scheduled = await request(app.getHttpServer())
      .post(`/ace/homework/assignments/${created.body.id}/schedule`)
      .set("Authorization", authorization)
      .send({
        version: created.body.version,
        scheduledAt: new Date(Date.now() + 60_000).toISOString(),
      });
    expect(scheduled.status).toBe(200);

    const addedChildId = randomUUID();
    const addedEnrollmentId = randomUUID();
    await withTenantRlsContext(siteId, orgId, async (tx) => {
      await tx.child.create({
        data: {
          id: addedChildId,
          tenantId: siteId,
          firstName: "New",
          lastName: "Pupil",
        },
      });
      await tx.aceSchoolEnrollment.create({
        data: {
          id: addedEnrollmentId,
          tenantId: siteId,
          childId: addedChildId,
          academicYearId,
          yearBandId,
          startsOn: siteCalendarDate(new Date(), "Europe/London"),
        },
      });
    });
    try {
      await prisma.aceHomeworkAssignment.update({
        where: { id: created.body.id },
        data: { scheduledAt: new Date(Date.now() - 60_000) },
      });
      const run = await request(app.getHttpServer())
        .get("/internal/homework-schedules/run")
        .set("Authorization", `Bearer ${process.env.CRON_SECRET}`);
      expect(run.status).toBe(200);
      expect(run.body.needsReview).toBe(1);
      expect(
        await prisma.aceHomeworkRecipient.count({
          where: { assignmentId: created.body.id },
        }),
      ).toBe(0);
    } finally {
      await prisma.aceSchoolEnrollment.delete({
        where: { id: addedEnrollmentId },
      });
      await prisma.child.delete({ where: { id: addedChildId } });
    }
  });

  it("keeps an enrolment and staff class assignment valid through the site's end date", async () => {
    if (!app) return;
    const today = siteCalendarDate(new Date(), "Europe/London");
    await prisma.aceSchoolEnrollment.update({
      where: { id: currentEnrollmentId },
      data: { endsOn: today },
    });
    await prisma.aceStaffYearBandAssignment.updateMany({
      where: { tenantId: siteId, userId: teacherId },
      data: { endsOn: today },
    });
    try {
      const options = await request(app.getHttpServer())
        .get("/ace/homework/assignments/options")
        .set("Authorization", teacherAuthorization);
      expect(options.status).toBe(200);
      expect(options.body.yearBands).toEqual([
        expect.objectContaining({ id: yearBandId }),
      ]);
      const created = await request(app.getHttpServer())
        .post("/ace/homework/assignments")
        .set("Authorization", teacherAuthorization)
        .send({
          title: "Last valid day",
          instructions: "Complete this task today.",
          academicYearId,
          yearBandId,
          subjectId,
          dueAt,
        });
      expect(created.status).toBe(201);
      const published = await request(app.getHttpServer())
        .post(`/ace/homework/assignments/${created.body.id}/publish`)
        .set("Authorization", teacherAuthorization)
        .send({ version: created.body.version });
      expect(published.status).toBe(200);
      expect(published.body.recipientCount).toBe(1);
    } finally {
      await prisma.aceSchoolEnrollment.update({
        where: { id: currentEnrollmentId },
        data: { endsOn: null },
      });
      await prisma.aceStaffYearBandAssignment.updateMany({
        where: { tenantId: siteId, userId: teacherId },
        data: { endsOn: null },
      });
    }
  });

  it("shows teachers only assignments for their current year bands", async () => {
    if (!app) return;
    const create = (title: string, selectedYearBandId: string) =>
      request(app!.getHttpServer())
        .post("/ace/homework/assignments")
        .set("Authorization", authorization)
        .send({
          title,
          instructions: "Complete the class task.",
          academicYearId,
          yearBandId: selectedYearBandId,
          subjectId,
          dueAt: dueAt,
        });
    expect((await create("Year 5 task", yearBandId)).status).toBe(201);
    expect((await create("Year 6 task", otherYearBandId)).status).toBe(201);

    const listed = await request(app.getHttpServer())
      .get("/ace/homework/assignments")
      .set("Authorization", teacherAuthorization);
    expect(listed.status).toBe(200);
    expect(listed.body.map((row: { title: string }) => row.title)).toContain(
      "Year 5 task",
    );
    expect(
      listed.body.map((row: { title: string }) => row.title),
    ).not.toContain("Year 6 task");
  });

  it("limits teacher choices and denies moving another class's draft into their class", async () => {
    if (!app) return;
    const choices = await request(app.getHttpServer())
      .get("/ace/homework/assignments/options")
      .set("Authorization", teacherAuthorization);
    expect(choices.status).toBe(200);
    expect(choices.body.yearBands).toEqual([
      expect.objectContaining({ id: yearBandId }),
    ]);

    const created = await request(app.getHttpServer())
      .post("/ace/homework/assignments")
      .set("Authorization", authorization)
      .send({
        title: "Other class draft",
        instructions: "Keep this draft in its class.",
        academicYearId,
        yearBandId: otherYearBandId,
        subjectId,
        dueAt,
      });
    expect(created.status).toBe(201);
    const moved = await request(app.getHttpServer())
      .patch(`/ace/homework/assignments/${created.body.id}`)
      .set("Authorization", teacherAuthorization)
      .send({
        version: created.body.version,
        title: "Wrong class move",
        instructions: "Not allowed.",
        academicYearId,
        yearBandId,
        subjectId,
        dueAt,
      });
    expect(moved.status).toBe(403);
  });

  it("hides assignments and denies writes from another site in the same organisation", async () => {
    if (!app) return;
    const created = await request(app.getHttpServer())
      .post("/ace/homework/assignments")
      .set("Authorization", authorization)
      .send({
        title: "Site A private task",
        instructions: "Only this school can manage it.",
        academicYearId,
        yearBandId,
        subjectId,
        dueAt: dueAt,
      });
    expect(created.status).toBe(201);
    const listed = await request(app.getHttpServer())
      .get("/ace/homework/assignments")
      .set("Authorization", otherSiteAuthorization);
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual([]);

    const edited = await request(app.getHttpServer())
      .patch(`/ace/homework/assignments/${created.body.id}`)
      .set("Authorization", otherSiteAuthorization)
      .send({
        version: created.body.version,
        title: "Cross-site edit",
        instructions: "Not allowed.",
        academicYearId,
        yearBandId,
        subjectId,
        dueAt: dueAt,
      });
    expect(edited.status).toBe(404);
    const publish = await request(app.getHttpServer())
      .post(`/ace/homework/assignments/${created.body.id}/publish`)
      .set("Authorization", otherSiteAuthorization)
      .send({ version: created.body.version });
    expect(publish.status).toBe(404);
  });

  it("enforces assignment and recipient tenant RLS for a non-bypass database role", async () => {
    if (!app || process.env.E2E_USE_GLOBAL_SETUP !== "true") return;
    const created = await request(app.getHttpServer())
      .post("/ace/homework/assignments")
      .set("Authorization", authorization)
      .send({
        title: "RLS homework task",
        instructions: "The audience is private to this school.",
        academicYearId,
        yearBandId,
        subjectId,
        dueAt: dueAt,
      });
    expect(created.status).toBe(201);
    const published = await request(app.getHttpServer())
      .post(`/ace/homework/assignments/${created.body.id}/publish`)
      .set("Authorization", authorization)
      .send({ version: created.body.version });
    expect(published.status).toBe(200);

    const own = await withTenantRlsContext(siteId, orgId, async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL ROLE "pathway_e2e_tenant_rls"');
      return tx.$queryRaw<Array<{ assignments: bigint; recipients: bigint }>>`
        SELECT
          (SELECT count(*) FROM "AceHomeworkAssignment" WHERE "id" = ${created.body.id}) AS assignments,
          (SELECT count(*) FROM "AceHomeworkRecipient" WHERE "assignmentId" = ${created.body.id}) AS recipients
      `;
    });
    expect(own).toEqual([{ assignments: 1n, recipients: 1n }]);

    const visible = await withTenantRlsContext(
      otherSiteId,
      orgId,
      async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL ROLE "pathway_e2e_tenant_rls"');
        return tx.$queryRaw<Array<{ assignments: bigint; recipients: bigint }>>`
        SELECT
          (SELECT count(*) FROM "AceHomeworkAssignment" WHERE "id" = ${created.body.id}) AS assignments,
          (SELECT count(*) FROM "AceHomeworkRecipient" WHERE "assignmentId" = ${created.body.id}) AS recipients
      `;
      },
    );
    expect(visible).toEqual([{ assignments: 0n, recipients: 0n }]);
  });
});
