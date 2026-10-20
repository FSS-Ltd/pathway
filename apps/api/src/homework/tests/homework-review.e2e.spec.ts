import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma, withTenantRlsContext } from "@pathway/db";
import request from "supertest";
import {
  requireDatabase,
  seedE2eAuthUser,
  seedE2eTypedRole,
} from "../../../test-helpers.e2e";
import { AppModule } from "../../app.module";
import { MailerService } from "../../mailer/mailer.service";

describe("ACE homework review", () => {
  const orgId = randomUUID();
  const siteId = randomUUID();
  const reviewerId = randomUUID();
  const studentId = randomUUID();
  const guardianId = randomUUID();
  const childId = randomUUID();
  const yearId = randomUUID();
  const bandId = randomUUID();
  const subjectId = randomUUID();
  const enrollmentId = randomUUID();
  const assignmentId = randomUUID();
  const recipientId = randomUUID();
  const submissionId = randomUUID();
  const versionId = randomUUID();
  const completedVersionId = randomUUID();
  const now = new Date();
  let app: INestApplication | undefined;
  let reviewerAuth = "";
  let studentAuth = "";
  let guardianAuth = "";
  const returnKey = randomUUID();
  const previousReviewFlag = process.env.ACE_HOMEWORK_REVIEWS_ENABLED;
  const previousNotificationsFlag =
    process.env.ACE_HOMEWORK_NOTIFICATIONS_ENABLED;
  const previousCronSecret = process.env.CRON_SECRET;

  beforeAll(async () => {
    if (!requireDatabase()) return;
    process.env.ACE_HOMEWORK_REVIEWS_ENABLED = "true";
    await prisma.org.create({
      data: {
        id: orgId,
        name: `Homework review ${orgId}`,
        slug: `homework-review-${orgId}`,
        planCode: "trial",
        parentPortalEnabled: true,
      },
    });
    await prisma.orgVertical.create({
      data: { orgId, vertical: "ACE_SCHOOL" },
    });
    await prisma.tenant.create({
      data: {
        id: siteId,
        orgId,
        name: "Homework review school",
        slug: `homework-review-${siteId}`,
        timezone: "Europe/London",
      },
    });
    reviewerAuth = (
      await seedE2eAuthUser({
        subject: `homework-reviewer-${reviewerId}`,
        userId: reviewerId,
        tenantId: siteId,
        siteRole: "STAFF",
        orgId,
        orgRole: "ORG_MEMBER",
      })
    ).authorization;
    studentAuth = (
      await seedE2eAuthUser({
        subject: `homework-review-student-${studentId}`,
        userId: studentId,
        tenantId: siteId,
        orgId,
      })
    ).authorization;
    guardianAuth = (
      await seedE2eAuthUser({
        subject: `homework-review-guardian-${guardianId}`,
        userId: guardianId,
        tenantId: siteId,
        orgId,
      })
    ).authorization;
    await seedE2eTypedRole({
      orgId,
      tenantId: siteId,
      userId: reviewerId,
      scope: "site",
      permissionKeys: ["ace.homework.reviews.manage"],
    });
    await withTenantRlsContext(siteId, orgId, async (tx) => {
      await tx.academicYear.create({
        data: {
          id: yearId,
          tenantId: siteId,
          name: "Review year",
          startsOn: new Date(now.getTime() - 90 * 86_400_000),
          endsOn: new Date(now.getTime() + 90 * 86_400_000),
          status: "ACTIVE",
        },
      });
      await tx.aceYearBand.create({
        data: { id: bandId, tenantId: siteId, name: "Year 5" },
      });
      await tx.aceStaffYearBandAssignment.create({
        data: {
          tenantId: siteId,
          userId: reviewerId,
          yearBandId: bandId,
          startsOn: new Date(now.getTime() - 30 * 86_400_000),
        },
      });
      await tx.subject.create({
        data: { id: subjectId, tenantId: siteId, name: "English" },
      });
      await tx.child.create({
        data: {
          id: childId,
          tenantId: siteId,
          firstName: "Review",
          lastName: "Pupil",
        },
      });
      await tx.studentPortalPolicy.create({
        data: { tenantId: siteId, studentPortalEnabled: true },
      });
      const studentIdentity = await tx.studentIdentity.create({
        data: { tenantId: siteId, userId: studentId },
      });
      await tx.studentIdentityLink.create({
        data: {
          tenantId: siteId,
          studentIdentityId: studentIdentity.id,
          childId,
        },
      });
      const guardian = await tx.guardianIdentity.create({
        data: { tenantId: siteId, userId: guardianId },
      });
      await tx.guardianChildRelationship.create({
        data: {
          tenantId: siteId,
          guardianIdentityId: guardian.id,
          childId,
          legalAccess: "FULL",
        },
      });
      await tx.aceSchoolEnrollment.create({
        data: {
          id: enrollmentId,
          tenantId: siteId,
          childId,
          academicYearId: yearId,
          yearBandId: bandId,
          startsOn: new Date(now.getTime() - 30 * 86_400_000),
        },
      });
      await tx.aceHomeworkAssignment.create({
        data: {
          id: assignmentId,
          tenantId: siteId,
          academicYearId: yearId,
          yearBandId: bandId,
          subjectId,
          createdByUserId: reviewerId,
          title: "Read a chapter",
          instructions: "Write a short response.",
          dueAt: new Date(now.getTime() + 7 * 86_400_000),
        },
      });
      await tx.aceHomeworkRecipient.create({
        data: {
          id: recipientId,
          tenantId: siteId,
          assignmentId,
          childId,
          enrollmentId,
        },
      });
      await tx.aceHomeworkAssignment.update({
        where: { id_tenantId: { id: assignmentId, tenantId: siteId } },
        data: { status: "PUBLISHED", publishedAt: now },
      });
      await tx.aceHomeworkSubmission.create({
        data: {
          id: submissionId,
          tenantId: siteId,
          recipientId,
          status: "SUBMITTED",
          version: 1,
          draftText: "My response",
        },
      });
      await tx.aceHomeworkSubmissionVersion.create({
        data: {
          id: versionId,
          tenantId: siteId,
          submissionId,
          number: 1,
          idempotencyKey: randomUUID(),
          text: "My response",
          late: false,
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
    if (previousReviewFlag === undefined)
      delete process.env.ACE_HOMEWORK_REVIEWS_ENABLED;
    else process.env.ACE_HOMEWORK_REVIEWS_ENABLED = previousReviewFlag;
    if (previousNotificationsFlag === undefined)
      delete process.env.ACE_HOMEWORK_NOTIFICATIONS_ENABLED;
    else
      process.env.ACE_HOMEWORK_NOTIFICATIONS_ENABLED =
        previousNotificationsFlag;
    if (previousCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousCronSecret;
  });

  it("lists submitted work for a currently assigned reviewer", async () => {
    if (!app) return;
    const response = await request(app.getHttpServer())
      .get("/ace/homework/reviews")
      .set("Authorization", reviewerAuth);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ reviewsEnabled: true });
    expect(response.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          assignmentId,
          submissionId,
          versionId,
          studentName: "Review Pupil",
        }),
      ]),
    );
  });

  it("returns the submitted version for changes without replacing student work", async () => {
    if (!app) return;
    const response = await request(app.getHttpServer())
      .post("/ace/homework/reviews")
      .set("Authorization", reviewerAuth)
      .send({
        versionId,
        decision: "RETURNED",
        feedback: "Please add a citation.",
        staffNote: "Check the next draft.",
        idempotencyKey: returnKey,
      });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      versionId,
      decision: "RETURNED",
    });
    const submission = await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.aceHomeworkSubmission.findUniqueOrThrow({
        where: { id_tenantId: { id: submissionId, tenantId: siteId } },
        select: { status: true, version: true },
      }),
    );
    expect(submission).toEqual({ status: "RETURNED", version: 1 });
  });

  it("shows returned feedback to the linked student without staff notes", async () => {
    if (!app) return;
    const response = await request(app.getHttpServer())
      .get(`/ace/student/sites/${siteId}/homework`)
      .set("Authorization", studentAuth);
    expect(response.status).toBe(200);
    const assignment = response.body.assignments.find(
      (item: { id: string }) => item.id === assignmentId,
    );
    expect(assignment.submission.versions[0].review).toMatchObject({
      decision: "RETURNED",
      feedback: "Please add a citation.",
    });
    expect(JSON.stringify(response.body)).not.toContain(
      "Check the next draft.",
    );
  });

  it("keeps completed feedback private until an explicit release", async () => {
    if (!app) return;
    await withTenantRlsContext(siteId, orgId, async (tx) => {
      await tx.aceHomeworkSubmissionVersion.create({
        data: {
          id: completedVersionId,
          tenantId: siteId,
          submissionId,
          number: 2,
          idempotencyKey: randomUUID(),
          text: "My revised response",
          late: false,
        },
      });
      await tx.aceHomeworkSubmission.update({
        where: { id_tenantId: { id: submissionId, tenantId: siteId } },
        data: { version: 2, status: "SUBMITTED" },
      });
    });
    const decision = await request(app.getHttpServer())
      .post("/ace/homework/reviews")
      .set("Authorization", reviewerAuth)
      .send({
        versionId: completedVersionId,
        decision: "COMPLETED",
        feedback: "Good work.",
        staffNote: "Discuss next term.",
        idempotencyKey: randomUUID(),
      });
    expect(decision.status).toBe(200);
    const before = await request(app.getHttpServer())
      .get(`/ace/student/sites/${siteId}/homework`)
      .set("Authorization", studentAuth);
    expect(before.status).toBe(200);
    expect(JSON.stringify(before.body)).not.toContain("Good work.");
    expect(JSON.stringify(before.body)).not.toContain("Discuss next term.");
    const guardianBefore = await request(app.getHttpServer())
      .get(`/ace/family/sites/${siteId}/children/${childId}/homework`)
      .set("Authorization", guardianAuth);
    expect(guardianBefore.status).toBe(200);
    expect(JSON.stringify(guardianBefore.body)).not.toContain("Good work.");
    expect(JSON.stringify(guardianBefore.body)).not.toContain(
      "Discuss next term.",
    );

    const released = await request(app.getHttpServer())
      .post(`/ace/homework/reviews/${decision.body.id}/release`)
      .set("Authorization", reviewerAuth);
    expect(released.status).toBe(200);
    expect(released.body.releasedAt).toBeTruthy();
    const after = await request(app.getHttpServer())
      .get(`/ace/student/sites/${siteId}/homework`)
      .set("Authorization", studentAuth);
    expect(JSON.stringify(after.body)).toContain("Good work.");
    expect(JSON.stringify(after.body)).not.toContain("Discuss next term.");
    const guardianAfter = await request(app.getHttpServer())
      .get(`/ace/family/sites/${siteId}/children/${childId}/homework`)
      .set("Authorization", guardianAuth);
    expect(guardianAfter.status).toBe(200);
    expect(JSON.stringify(guardianAfter.body)).toContain("Good work.");
    expect(JSON.stringify(guardianAfter.body)).not.toContain(
      "Discuss next term.",
    );
    const otherChild = await request(app.getHttpServer())
      .get(`/ace/family/sites/${siteId}/children/${randomUUID()}/homework`)
      .set("Authorization", guardianAuth);
    expect(otherChild.status).toBe(404);
    const studentAsGuardian = await request(app.getHttpServer())
      .get(`/ace/family/sites/${siteId}/children/${childId}/homework`)
      .set("Authorization", studentAuth);
    expect(studentAsGuardian.status).toBe(404);
  });

  it("returns an idempotent decision and rejects a competing reviewer command", async () => {
    if (!app) return;
    const duplicate = await request(app.getHttpServer())
      .post("/ace/homework/reviews")
      .set("Authorization", reviewerAuth)
      .send({
        versionId,
        decision: "RETURNED",
        feedback: "Please add a citation.",
        staffNote: "Check the next draft.",
        idempotencyKey: returnKey,
      });
    expect(duplicate.status).toBe(200);
    const competing = await request(app.getHttpServer())
      .post("/ace/homework/reviews")
      .set("Authorization", reviewerAuth)
      .send({
        versionId,
        decision: "COMPLETED",
        feedback: "Different decision.",
        staffNote: "",
        idempotencyKey: randomUUID(),
      });
    expect(competing.status).toBe(409);
  });

  it("claims content-safe email once and suppresses a revoked guardian", async () => {
    if (!app) return;
    process.env.ACE_HOMEWORK_NOTIFICATIONS_ENABLED = "true";
    process.env.CRON_SECRET = "homework-e2e-cron-secret";
    await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.guardianChildRelationship.updateMany({
        where: {
          tenantId: siteId,
          childId,
          guardianIdentity: { userId: guardianId },
        },
        data: {
          revokedAt: new Date(),
          revokedByUserId: reviewerId,
          revocationReason: "E2E access check",
        },
      }),
    );
    const events = await prisma.outboxEvent.findMany({
      where: { orgId, eventType: "ace.homework.email" },
      select: { id: true, payload: true },
    });
    expect(events).toHaveLength(2);
    await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.outboxEvent.updateMany({
        where: { orgId, id: { in: events.map((event) => event.id) } },
        data: { createdAt: new Date("2000-01-01T00:00:00.000Z") },
      }),
    );
    expect(JSON.stringify(events)).not.toContain("Please add a citation.");
    expect(JSON.stringify(events)).not.toContain("Check the next draft.");
    expect(JSON.stringify(events)).not.toContain("Good work.");
    const mailer = app.get(MailerService);
    const availability = jest
      .spyOn(mailer, "isHomeworkEmailAvailable")
      .mockReturnValue(true);
    const send = jest
      .spyOn(mailer, "sendHomeworkNotification")
      .mockResolvedValue("provider-id");
    try {
      const first = await request(app.getHttpServer())
        .get("/internal/homework-email/run")
        .set("Authorization", `Bearer ${process.env.CRON_SECRET}`);
      expect(first.status).toBe(200);
      expect(first.body.inspected).toBeGreaterThanOrEqual(2);
      expect(
        send.mock.calls.filter(
          ([address]) => address === `${studentId}@example.test`,
        ),
      ).toHaveLength(1);
      expect(
        send.mock.calls.filter(
          ([address]) => address === `${guardianId}@example.test`,
        ),
      ).toHaveLength(0);
      const own = await prisma.outboxEvent.findMany({
        where: { id: { in: events.map((event) => event.id) } },
        select: { status: true },
      });
      expect(own.every((event) => event.status === "DISPATCHED")).toBe(true);
      const second = await request(app.getHttpServer())
        .get("/internal/homework-email/run")
        .set("Authorization", `Bearer ${process.env.CRON_SECRET}`);
      expect(second.status).toBe(200);
      expect(
        send.mock.calls.filter(
          ([address]) => address === `${studentId}@example.test`,
        ),
      ).toHaveLength(1);
    } finally {
      availability.mockRestore();
      send.mockRestore();
    }
  });

  it("dead letters an uncertain provider outcome without an automatic resend", async () => {
    if (!app) return;
    process.env.ACE_HOMEWORK_NOTIFICATIONS_ENABLED = "true";
    process.env.CRON_SECRET = "homework-e2e-cron-secret";
    const event = await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.outboxEvent.create({
        data: {
          orgId,
          aggregateType: "ACE_HOMEWORK",
          aggregateId: completedVersionId,
          eventType: "ace.homework.email",
          idempotencyKey: randomUUID(),
          createdAt: new Date("1998-01-01T00:00:00.000Z"),
          payload: {
            tenantId: siteId,
            recipientId,
            sourceId: completedVersionId,
            action: "SUBMITTED",
            audience: "STAFF",
            userId: reviewerId,
          },
        },
        select: { id: true },
      }),
    );
    const mailer = app.get(MailerService);
    const availability = jest
      .spyOn(mailer, "isHomeworkEmailAvailable")
      .mockReturnValue(true);
    const send = jest
      .spyOn(mailer, "sendHomeworkNotification")
      .mockImplementation(async (_address, deliveryId) => {
        if (deliveryId === event.id) throw new Error("timeout");
        return "provider-id";
      });
    try {
      const first = await request(app.getHttpServer())
        .get("/internal/homework-email/run")
        .set("Authorization", `Bearer ${process.env.CRON_SECRET}`);
      expect(first.status).toBe(503);
      expect(
        send.mock.calls.filter(([, deliveryId]) => deliveryId === event.id),
      ).toHaveLength(1);
      const record = await prisma.outboxEvent.findUniqueOrThrow({
        where: { id: event.id },
        select: { status: true, lastError: true },
      });
      expect(record).toEqual({
        status: "DEAD_LETTER",
        lastError: "HOMEWORK_EMAIL_OUTCOME_UNKNOWN",
      });
      const second = await request(app.getHttpServer())
        .get("/internal/homework-email/run")
        .set("Authorization", `Bearer ${process.env.CRON_SECRET}`);
      expect(second.status).toBe(200);
      expect(
        send.mock.calls.filter(([, deliveryId]) => deliveryId === event.id),
      ).toHaveLength(1);
    } finally {
      availability.mockRestore();
      send.mockRestore();
    }
  });

  it("suppresses a homework email event whose tenant does not own the recipient", async () => {
    if (!app) return;
    process.env.ACE_HOMEWORK_NOTIFICATIONS_ENABLED = "true";
    process.env.CRON_SECRET = "homework-e2e-cron-secret";
    const event = await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.outboxEvent.create({
        data: {
          orgId,
          aggregateType: "ACE_HOMEWORK",
          aggregateId: completedVersionId,
          eventType: "ace.homework.email",
          idempotencyKey: randomUUID(),
          createdAt: new Date("1997-01-01T00:00:00.000Z"),
          payload: {
            tenantId: randomUUID(),
            recipientId,
            sourceId: completedVersionId,
            action: "SUBMITTED",
            audience: "STAFF",
            userId: reviewerId,
          },
        },
        select: { id: true },
      }),
    );
    const mailer = app.get(MailerService);
    const availability = jest
      .spyOn(mailer, "isHomeworkEmailAvailable")
      .mockReturnValue(true);
    const send = jest
      .spyOn(mailer, "sendHomeworkNotification")
      .mockResolvedValue("provider-id");
    try {
      const response = await request(app.getHttpServer())
        .get("/internal/homework-email/run")
        .set("Authorization", `Bearer ${process.env.CRON_SECRET}`);
      expect(response.status).toBe(200);
      expect(response.body.suppressed).toBeGreaterThanOrEqual(1);
      expect(
        send.mock.calls.some(([, deliveryId]) => deliveryId === event.id),
      ).toBe(false);
      const record = await prisma.outboxEvent.findUniqueOrThrow({
        where: { id: event.id },
        select: { status: true },
      });
      expect(record.status).toBe("DISPATCHED");
    } finally {
      availability.mockRestore();
      send.mockRestore();
    }
  });

  it("allows only one decision when reviewers race on the same version", async () => {
    if (!app) return;
    const raceAssignmentId = randomUUID();
    const raceRecipientId = randomUUID();
    const raceSubmissionId = randomUUID();
    const raceVersionId = randomUUID();
    await withTenantRlsContext(siteId, orgId, async (tx) => {
      await tx.aceHomeworkAssignment.create({
        data: {
          id: raceAssignmentId,
          tenantId: siteId,
          academicYearId: yearId,
          yearBandId: bandId,
          subjectId,
          createdByUserId: reviewerId,
          title: "A second chapter",
          instructions: "Write a summary.",
          dueAt: new Date(now.getTime() + 8 * 86_400_000),
        },
      });
      await tx.aceHomeworkRecipient.create({
        data: {
          id: raceRecipientId,
          tenantId: siteId,
          assignmentId: raceAssignmentId,
          childId,
          enrollmentId,
        },
      });
      await tx.aceHomeworkAssignment.update({
        where: { id_tenantId: { id: raceAssignmentId, tenantId: siteId } },
        data: { status: "PUBLISHED", publishedAt: now },
      });
      await tx.aceHomeworkSubmission.create({
        data: {
          id: raceSubmissionId,
          tenantId: siteId,
          recipientId: raceRecipientId,
          status: "SUBMITTED",
          version: 1,
          draftText: "Second answer",
        },
      });
      await tx.aceHomeworkSubmissionVersion.create({
        data: {
          id: raceVersionId,
          tenantId: siteId,
          submissionId: raceSubmissionId,
          number: 1,
          idempotencyKey: randomUUID(),
          text: "Second answer",
          late: false,
        },
      });
    });
    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post("/ace/homework/reviews")
        .set("Authorization", reviewerAuth)
        .send({
          versionId: raceVersionId,
          decision: "RETURNED",
          feedback: "Revise.",
          staffNote: "",
          idempotencyKey: randomUUID(),
        }),
      request(app.getHttpServer())
        .post("/ace/homework/reviews")
        .set("Authorization", reviewerAuth)
        .send({
          versionId: raceVersionId,
          decision: "COMPLETED",
          feedback: "Done.",
          staffNote: "",
          idempotencyKey: randomUUID(),
        }),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const review = await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.aceHomeworkReview.findMany({
        where: { tenantId: siteId, versionId: raceVersionId },
      }),
    );
    expect(review).toHaveLength(1);
    await expect(
      withTenantRlsContext(siteId, orgId, (tx) =>
        tx.aceHomeworkReview.update({
          where: { id_tenantId: { id: review[0].id, tenantId: siteId } },
          data: { staffNote: "Mutated" },
        }),
      ),
    ).rejects.toThrow();
  });

  it("keeps review rows behind tenant RLS", async () => {
    if (!app) return;
    const own = await withTenantRlsContext(
      siteId,
      orgId,
      (tx) =>
        tx.$queryRaw<
          Array<{ count: bigint }>
        >`SELECT count(*) AS count FROM "AceHomeworkReview"`,
    );
    const other = await withTenantRlsContext(
      randomUUID(),
      orgId,
      (tx) =>
        tx.$queryRaw<
          Array<{ count: bigint }>
        >`SELECT count(*) AS count FROM "AceHomeworkReview"`,
    );
    expect(own[0].count).toBeGreaterThan(0n);
    expect(other[0].count).toBe(0n);
  });

  it("denies a reviewer after class assignment is revoked", async () => {
    if (!app) return;
    await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.aceStaffYearBandAssignment.updateMany({
        where: { tenantId: siteId, userId: reviewerId, yearBandId: bandId },
        data: { endsOn: new Date(now.getTime() - 86_400_000) },
      }),
    );
    const queue = await request(app.getHttpServer())
      .get("/ace/homework/reviews")
      .set("Authorization", reviewerAuth);
    expect(queue.status).toBe(200);
    expect(queue.body.items).toEqual([]);
    const command = await request(app.getHttpServer())
      .post("/ace/homework/reviews")
      .set("Authorization", reviewerAuth)
      .send({
        versionId,
        decision: "RETURNED",
        feedback: "Please add a citation.",
        staffNote: "Check the next draft.",
        idempotencyKey: returnKey,
      });
    expect(command.status).toBe(403);
  });
});
