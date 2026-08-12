import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma, withTenantRlsContext } from "@pathway/db";
import request from "supertest";
import { AppModule } from "../../app.module";
import {
  clearE2eAuthAccess,
  clearE2eTypedRole,
  requireDatabase,
  seedE2eAuthUser,
  seedE2eTypedRole,
} from "../../../test-helpers.e2e";

interface DailyOperationsFixture {
  orgId: string;
  tenantId: string;
  groupId: string;
  childId: string;
  subjectId: string;
  actorUserId: string;
  authorization: string;
  localDate: string;
  occurredAt: string;
}

describe("ACE dashboard daily operations", () => {
  let app: INestApplication | undefined;
  let fixture: DailyOperationsFixture | undefined;
  let typedRole: Awaited<ReturnType<typeof seedE2eTypedRole>> | undefined;

  beforeAll(async () => {
    if (!requireDatabase()) return;

    const orgId = randomUUID();
    const tenantId = randomUUID();
    const groupId = randomUUID();
    const childId = randomUUID();
    const subjectId = randomUUID();
    const eventInstant = new Date(Date.now() + 60_000);
    const localDate = localDateAt(eventInstant, "Europe/London");

    await prisma.org.create({
      data: {
        id: orgId,
        name: `ACE daily operations ${orgId}`,
        slug: `ace-daily-operations-${orgId}`,
        planCode: "trial",
      },
    });
    await prisma.tenant.create({
      data: {
        id: tenantId,
        orgId,
        name: `ACE daily operations site ${tenantId}`,
        slug: `ace-daily-operations-${tenantId}`,
        timezone: "Europe/London",
      },
    });
    await prisma.orgVertical.create({
      data: { orgId, vertical: "ACE_SCHOOL" },
    });

    const auth = await seedE2eAuthUser({
      subject: `ace-daily-operations-${randomUUID()}`,
      tenantId,
      siteRole: "SITE_ADMIN",
      orgId,
      orgRole: "ORG_ADMIN",
    });
    typedRole = await seedE2eTypedRole({
      orgId,
      tenantId,
      userId: auth.userId,
      scope: "site",
      permissionKeys: [
        "ace.settings.manage",
        "ace.pace.record",
        "ace.pace.correct",
        "ace.behaviour.policy.manage",
        "ace.behaviour.record",
        "attendance.manage",
        "ace.dashboard.read",
      ],
      name: `ACE daily operations role ${randomUUID()}`,
    });

    await withTenantRlsContext(tenantId, orgId, async (tx) => {
      await tx.group.create({
        data: {
          id: groupId,
          tenantId,
          name: `ACE daily operations group ${groupId}`,
        },
      });
      await tx.child.create({
        data: {
          id: childId,
          tenantId,
          groupId,
          firstName: "Operations",
          lastName: "Learner",
        },
      });
      await tx.subject.create({
        data: {
          id: subjectId,
          tenantId,
          name: `ACE daily operations subject ${subjectId}`,
        },
      });
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    fixture = {
      orgId,
      tenantId,
      groupId,
      childId,
      subjectId,
      actorUserId: auth.userId,
      authorization: auth.authorization,
      localDate,
      occurredAt: eventInstant.toISOString(),
    };
  });

  afterAll(async () => {
    let firstError: unknown;
    const cleanUp = async (operation: () => Promise<void>) => {
      try {
        await operation();
      } catch (error) {
        firstError ??= error;
      }
    };

    await cleanUp(() => app?.close() ?? Promise.resolve());
    if (fixture) {
      await cleanUp(() =>
        prisma.outboxEvent
          .deleteMany({ where: { orgId: fixture!.orgId } })
          .then(() => undefined),
      );
      await cleanUp(() =>
        prisma.auditEvent
          .deleteMany({
            where: { tenantId: fixture!.tenantId },
          })
          .then(() => undefined),
      );
      await cleanUp(() =>
        prisma.attendance
          .deleteMany({
            where: { childId: fixture!.childId },
          })
          .then(() => undefined),
      );
      await cleanUp(() =>
        withTenantRlsContext(fixture!.tenantId, fixture!.orgId, async (tx) => {
          await tx.$executeRawUnsafe(
            "SET LOCAL session_replication_role = replica",
          );
          await tx.paceProgress.deleteMany({
            where: { tenantId: fixture!.tenantId },
          });
          await tx.paceAssessment.deleteMany({
            where: { tenantId: fixture!.tenantId },
          });
          await tx.studentSubjectEnrollment.deleteMany({
            where: { tenantId: fixture!.tenantId },
          });
          await tx.behaviourEntry.deleteMany({
            where: { tenantId: fixture!.tenantId },
          });
          await tx.behaviourCategory.deleteMany({
            where: { tenantId: fixture!.tenantId },
          });
          await tx.demeritPolicy.deleteMany({
            where: { tenantId: fixture!.tenantId },
          });
          await tx.pacePolicy.deleteMany({
            where: { tenantId: fixture!.tenantId },
          });
          await tx.$executeRawUnsafe(
            "SET LOCAL session_replication_role = origin",
          );
        }),
      );
      await cleanUp(() =>
        prisma.academicPeriod
          .deleteMany({
            where: { tenantId: fixture!.tenantId },
          })
          .then(() => undefined),
      );
      await cleanUp(() =>
        prisma.academicYear
          .deleteMany({
            where: { tenantId: fixture!.tenantId },
          })
          .then(() => undefined),
      );
      await cleanUp(() =>
        prisma.subject
          .deleteMany({
            where: { id: fixture!.subjectId },
          })
          .then(() => undefined),
      );
      await cleanUp(() =>
        prisma.child
          .deleteMany({ where: { id: fixture!.childId } })
          .then(() => undefined),
      );
      await cleanUp(() =>
        prisma.group
          .deleteMany({ where: { id: fixture!.groupId } })
          .then(() => undefined),
      );
      await cleanUp(() =>
        typedRole
          ? clearE2eTypedRole(typedRole, fixture!.orgId)
          : Promise.resolve(),
      );
      await cleanUp(() => clearE2eAuthAccess(fixture!.actorUserId));
      await cleanUp(() =>
        prisma.staffActivity
          .deleteMany({
            where: { staffUserId: fixture!.actorUserId },
          })
          .then(() => undefined),
      );
      await cleanUp(() =>
        prisma.user
          .deleteMany({ where: { id: fixture!.actorUserId } })
          .then(() => undefined),
      );
      await cleanUp(() =>
        prisma.orgVertical
          .deleteMany({ where: { orgId: fixture!.orgId } })
          .then(() => undefined),
      );
      await cleanUp(() =>
        prisma.tenant
          .deleteMany({ where: { id: fixture!.tenantId } })
          .then(() => undefined),
      );
      await cleanUp(() =>
        prisma.org
          .deleteMany({ where: { id: fixture!.orgId } })
          .then(() => undefined),
      );
    }

    if (firstError) throw firstError;
  });

  it("uses corrected terminal facts for the daily aggregate", async () => {
    if (!app || !fixture) return;

    const server = app.getHttpServer();
    const auth = fixture.authorization;

    await request(server)
      .put("/ace/settings")
      .set("Authorization", auth)
      .send({
        reason: "Configure the daily operations PACE policy",
        expectedPacePolicyVersion: 0,
        expectedDemeritPolicyVersion: 0,
        pacePolicy: {
          selfTestPassingScore: 80,
          paceTestPassingScore: 80,
          maxAssessmentsPerDay: 10,
          allowSamePaceSameDay: true,
        },
      })
      .expect(200);

    await request(server)
      .put("/ace/behaviour/policy")
      .set("Authorization", auth)
      .send({
        reason: "Configure daily operations behaviour categories",
        expectedCategoryVersion: 0,
        expectedDemeritPolicyVersion: 0,
        categories: [
          {
            code: "serious-review",
            label: "Serious review",
            type: "DEMERIT",
            visibility: "GENERAL",
            isActive: true,
            isSerious: true,
            sortOrder: 1,
          },
          {
            code: "site-review",
            label: "Site review",
            type: "DEMERIT",
            visibility: "GENERAL",
            isActive: true,
            isSerious: false,
            sortOrder: 2,
          },
        ],
        demeritPolicy: {
          windowDays: 30,
          stageOneThreshold: 1,
          stageTwoThreshold: 5,
          stageThreeThreshold: 10,
          seriousMisconductStage: 3,
        },
      })
      .expect(200);

    await request(server)
      .post("/ace/academic-years")
      .set("Authorization", auth)
      .send({
        reason: "Configure the daily operations period",
        name: `Daily operations ${fixture.localDate}`,
        startsOn: fixture.localDate,
        endsOn: fixture.localDate,
        periods: [
          {
            name: "Daily operations period",
            startsOn: fixture.localDate,
            endsOn: fixture.localDate,
          },
        ],
      })
      .expect(201);

    await request(server)
      .post(`/ace/students/${fixture.childId}/subjects`)
      .set("Authorization", auth)
      .send({
        subjectId: fixture.subjectId,
        startsOn: fixture.localDate,
        startingPace: 1001,
        currentPace: 1001,
        targetPace: 1001,
        reason: "Enrol the learner for daily operations",
      })
      .expect(201);

    const attendance = await request(server)
      .post("/attendance")
      .set("Authorization", auth)
      .send({
        childId: fixture.childId,
        groupId: fixture.groupId,
        status: "LATE",
        timestamp: fixture.occurredAt,
      })
      .expect(201);

    await request(server)
      .post("/ace/pace/assessments")
      .set("Authorization", auth)
      .send({
        idempotencyKey: randomUUID(),
        childId: fixture.childId,
        subjectId: fixture.subjectId,
        paceNumber: 1001,
        assessmentType: "SelfTest",
        score: 90,
        assessedAt: fixture.occurredAt,
        reason: "Record the required Self Test",
      })
      .expect(201);

    const pace = await request(server)
      .post("/ace/pace/assessments")
      .set("Authorization", auth)
      .send({
        idempotencyKey: randomUUID(),
        childId: fixture.childId,
        subjectId: fixture.subjectId,
        paceNumber: 1001,
        assessmentType: "FinalTest",
        score: 90,
        assessedAt: fixture.occurredAt,
        reason: "Record the PACE result",
      })
      .expect(201);

    const behaviour = await request(server)
      .post("/ace/behaviour")
      .set("Authorization", auth)
      .send({
        idempotencyKey: randomUUID(),
        childId: fixture.childId,
        category: "serious-review",
        type: "DEMERIT",
        visibility: "GENERAL",
        pointsDelta: -1,
        occurredAt: fixture.occurredAt,
        reason: "Restricted predecessor reason",
        note: "Restricted predecessor note",
      })
      .expect(201);

    const beforeCorrections = await request(server)
      .get(`/ace/dashboard?date=${fixture.localDate}`)
      .set("Authorization", auth)
      .expect(200);
    expect(beforeCorrections.body).toEqual({
      localDate: fixture.localDate,
      timezone: "Europe/London",
      attendance: { present: 0, absent: 0, late: 1, unmarked: 0 },
      pace: {
        ahead: 1,
        onTrack: 0,
        atRisk: 0,
        behind: 0,
        blocked: 0,
        stale: 0,
      },
      behaviour: { siteReview: 0, headReview: 1 },
    });

    await request(server)
      .patch(`/attendance/${attendance.body.id as string}`)
      .set("Authorization", auth)
      .send({
        status: "ABSENT",
        correctionReason: "Correct the attendance status",
        timestamp: fixture.occurredAt,
      })
      .expect(200);

    await request(server)
      .post(
        `/ace/pace/assessments/${pace.body.assessment.id as string}/corrections`,
      )
      .set("Authorization", auth)
      .send({
        childId: fixture.childId,
        subjectId: fixture.subjectId,
        paceNumber: 1001,
        assessmentType: "FinalTest",
        score: 70,
        assessedAt: fixture.occurredAt,
        reason: "Correct the PACE score",
      })
      .expect(201);

    await request(server)
      .post(`/ace/behaviour/${behaviour.body.entry.id as string}/corrections`)
      .set("Authorization", auth)
      .send({
        idempotencyKey: randomUUID(),
        childId: fixture.childId,
        category: "site-review",
        type: "DEMERIT",
        visibility: "GENERAL",
        pointsDelta: -1,
        occurredAt: fixture.occurredAt,
        reason: "Restricted successor reason",
      })
      .expect(201);

    const afterCorrections = await request(server)
      .get(`/ace/dashboard?date=${fixture.localDate}`)
      .set("Authorization", auth)
      .expect(200);
    expect(afterCorrections.body).toEqual({
      localDate: fixture.localDate,
      timezone: "Europe/London",
      attendance: { present: 0, absent: 1, late: 0, unmarked: 0 },
      pace: {
        ahead: 0,
        onTrack: 0,
        atRisk: 0,
        behind: 0,
        blocked: 1,
        stale: 0,
      },
      behaviour: { siteReview: 1, headReview: 0 },
    });
    expect(JSON.stringify(afterCorrections.body)).not.toMatch(
      /reason|note|guardian|family|add-on|child|Restricted/i,
    );
  });
});

function localDateAt(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}
