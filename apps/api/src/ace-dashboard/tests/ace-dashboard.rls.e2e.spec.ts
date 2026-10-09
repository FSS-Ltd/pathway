import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { ExecutionContext, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import { prisma, withTenantRlsContext } from "@pathway/db";
import request from "supertest";
import { AppModule } from "../../app.module";
import type { EffectivePermissionsService } from "../../access-control/effective-permissions.service";
import { AuthUserGuard } from "../../auth/auth-user.guard";
import { BehaviourCommandService } from "../../behaviour/behaviour-command.service";
import { DemeritEscalationService } from "../../behaviour/demerit-escalation.service";
import { OutboxService } from "../../common/outbox/outbox.service";
import type { MailerService } from "../../mailer/mailer.service";
import { PaceRequestRlsRoleLease } from "../../pace/tests/pace-request-rls-role-lease";
import {
  clearE2eAuthAccess,
  clearE2eTypedRole,
  requireDatabase,
  seedE2eAuthUser,
  seedE2eTypedRole,
} from "../../../test-helpers.e2e";

const TENANT_RLS_ROLE = "pathway_e2e_tenant_rls";
const E2E_BOOTSTRAP_ROLE = "pathway_test_user";
const LOCAL_DATE = "2026-03-29";

interface DashboardFixture {
  groupId: string;
  childIds: string[];
  subjectId: string;
  enrollmentId: string;
  progressId: string;
  attendanceIds: string[];
  behaviourEntryIds: string[];
  behaviourCorrectionIds: string[];
  retainedReviewSourceId: string;
  outboxEventIds: string[];
}

function behaviourCommandService(): BehaviourCommandService {
  const outbox = new OutboxService();
  const escalation = new DemeritEscalationService(outbox, {
    sendBehaviourNotification: jest.fn().mockResolvedValue(undefined),
  } as unknown as MailerService);
  const permissions = {
    resolve: jest.fn().mockResolvedValue({
      allowed: true,
      reason: "allowed",
      sourceRoleIds: ["fixture-role"],
    }),
  } as unknown as EffectivePermissionsService;
  return new BehaviourCommandService(outbox, permissions, escalation);
}

function useTenantRlsRole(): boolean {
  return process.env.E2E_USE_GLOBAL_SETUP === "true";
}

function bootstrapDatabaseUrl(): string {
  const databaseUrl = process.env.E2E_DATABASE_URL;
  if (!databaseUrl) throw new Error("E2E database URL is not configured");

  const url = new URL(databaseUrl);
  url.searchParams.set("options", `-c role=${E2E_BOOTSTRAP_ROLE}`);
  return url.toString();
}

describe("ACE dashboard restricted-role RLS", () => {
  let app: INestApplication | undefined;
  const orgId = randomUUID();
  const tenantAId = randomUUID();
  const tenantBId = randomUUID();
  let authA = { userId: "", authorization: "" };
  let authB = { userId: "", authorization: "" };
  let roleA: Awaited<ReturnType<typeof seedE2eTypedRole>> | undefined;
  let roleB: Awaited<ReturnType<typeof seedE2eTypedRole>> | undefined;
  let fixture: DashboardFixture | undefined;
  let requestRoleConfigured = false;
  let requestRoleLease: PaceRequestRlsRoleLease | undefined;

  beforeAll(async () => {
    if (!requireDatabase()) return;
    await prisma.org.create({
      data: {
        id: orgId,
        name: `ACE dashboard org ${orgId}`,
        slug: `ace-dashboard-${orgId}`,
        planCode: "trial",
      },
    });
    await prisma.tenant.createMany({
      data: [
        {
          id: tenantAId,
          orgId,
          name: `ACE dashboard site A ${tenantAId}`,
          slug: `ace-dashboard-a-${tenantAId}`,
          timezone: "Europe/London",
        },
        {
          id: tenantBId,
          orgId,
          name: `ACE dashboard site B ${tenantBId}`,
          slug: `ace-dashboard-b-${tenantBId}`,
          timezone: "America/New_York",
        },
      ],
    });
    await prisma.orgVertical.create({
      data: { orgId, vertical: "ACE_SCHOOL" },
    });

    authA = await seedE2eAuthUser({
      subject: `ace-dashboard-a-${randomUUID()}`,
      tenantId: tenantAId,
      siteRole: "STAFF",
      orgId,
      orgRole: "ORG_MEMBER",
    });
    authB = await seedE2eAuthUser({
      subject: `ace-dashboard-b-${randomUUID()}`,
      tenantId: tenantBId,
      siteRole: "STAFF",
      orgId,
      orgRole: "ORG_MEMBER",
    });
    roleA = await seedE2eTypedRole({
      orgId,
      tenantId: tenantAId,
      userId: authA.userId,
      scope: "site",
      permissionKeys: ["ace.dashboard.read"],
      name: `ACE dashboard A ${randomUUID()}`,
    });
    roleB = await seedE2eTypedRole({
      orgId,
      tenantId: tenantBId,
      userId: authB.userId,
      scope: "site",
      permissionKeys: ["ace.dashboard.read"],
      name: `ACE dashboard B ${randomUUID()}`,
    });
    fixture = await createPartialSiteFixture({
      orgId,
      tenantId: tenantAId,
      actorUserId: authA.userId,
    });

    requestRoleLease = new PaceRequestRlsRoleLease({
      enabled: useTenantRlsRole(),
      bootstrapRole: E2E_BOOTSTRAP_ROLE,
      restrictedRole: TENANT_RLS_ROLE,
      requestClient: prisma,
      createBootstrapClient: () =>
        new PrismaClient({
          datasources: { db: { url: bootstrapDatabaseUrl() } },
        }),
    });
    await requestRoleLease.enable();
    requestRoleConfigured = requestRoleLease.isConfigured;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(AuthUserGuard)
      .useValue({
        canActivate(context: ExecutionContext): boolean {
          const request = context
            .switchToHttp()
            .getRequest<
              Record<string, unknown> & { headers?: Record<string, string> }
            >();
          const selected =
            request.headers?.authorization === authB.authorization
              ? { auth: authB, tenantId: tenantBId }
              : { auth: authA, tenantId: tenantAId };
          request.authUserId = selected.auth.userId;
          request.__pathwayContext = {
            user: { userId: selected.auth.userId },
            org: { orgId },
            tenant: { tenantId: selected.tenantId, orgId },
            roles: { org: ["org:member"], tenant: ["tenant:staff"] },
            permissions: [],
            rawClaims: {},
            siteRole: "STAFF",
          };
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
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
    await cleanUp(() => requestRoleLease?.restore() ?? Promise.resolve());
    await cleanUp(() =>
      fixture ? cleanupFixture(fixture, tenantAId, orgId) : Promise.resolve(),
    );
    await cleanUp(() =>
      roleA ? clearE2eTypedRole(roleA, orgId) : Promise.resolve(),
    );
    await cleanUp(() =>
      roleB ? clearE2eTypedRole(roleB, orgId) : Promise.resolve(),
    );
    await cleanUp(async () => {
      for (const auth of [authA, authB]) {
        if (!auth.userId) continue;
        await clearE2eAuthAccess(auth.userId);
        await prisma.user.deleteMany({ where: { id: auth.userId } });
      }
    });
    await cleanUp(async () => {
      await prisma.orgVertical.deleteMany({ where: { orgId } });
      await prisma.tenant.deleteMany({ where: { orgId } });
      await prisma.org.deleteMany({ where: { id: orgId } });
    });

    if (firstError) throw firstError;
  });

  it("executes dashboard transactions as the no-BYPASS tenant RLS role", async () => {
    if (!requestRoleConfigured) return;

    const [role] = await withTenantRlsContext(
      tenantAId,
      orgId,
      (tx) =>
        tx.$queryRaw<
          Array<{
            currentUser: string;
            rolsuper: boolean;
            rolbypassrls: boolean;
          }>
        >`
        SELECT current_user AS "currentUser", rolsuper, rolbypassrls
        FROM pg_roles
        WHERE rolname = current_user
      `,
    );

    expect(role).toEqual({
      currentUser: TENANT_RLS_ROLE,
      rolsuper: false,
      rolbypassrls: false,
    });
  });

  it("returns only site A aggregate counts across the London DST boundary", async () => {
    if (!app || !fixture) return;

    const reviewIntentState = await withTenantRlsContext(
      tenantAId,
      orgId,
      async (tx) => {
        const [original, correction, retainedSource] = await Promise.all([
          tx.outboxEvent.count({
            where: {
              eventType: "behaviour.review-requested",
              aggregateId: { in: fixture!.behaviourEntryIds },
            },
          }),
          tx.outboxEvent.count({
            where: {
              eventType: "behaviour.review-requested",
              aggregateId: { in: fixture!.behaviourCorrectionIds },
            },
          }),
          tx.outboxEvent.findFirstOrThrow({
            where: {
              eventType: "behaviour.review-requested",
              aggregateId: fixture!.retainedReviewSourceId,
            },
            select: { payload: true },
          }),
        ]);
        return { original, correction, retainedSource };
      },
    );
    expect(reviewIntentState).toEqual({
      original: 2,
      correction: 0,
      retainedSource: {
        payload: expect.objectContaining({ occurredOn: "2026-03-28" }),
      },
    });

    const response = await request(app.getHttpServer())
      .get(`/ace/dashboard?date=${LOCAL_DATE}`)
      .set("Authorization", authA.authorization)
      .expect(200);

    expect(response.body).toEqual({
      localDate: LOCAL_DATE,
      timezone: "Europe/London",
      attendance: { present: 0, absent: 0, late: 1, unmarked: 1 },
      pace: {
        ahead: 0,
        onTrack: 1,
        atRisk: 0,
        behind: 0,
        blocked: 0,
        stale: 0,
      },
      behaviour: { siteReview: 0, headReview: 1 },
    });
    expect(response.body).not.toHaveProperty("children");
    expect(JSON.stringify(response.body)).not.toContain(
      "Sensitive behaviour narrative",
    );
  });

  it("returns a valid zero-count payload to the empty site B actor", async () => {
    if (!app) return;

    const response = await request(app.getHttpServer())
      .get(`/ace/dashboard?date=${LOCAL_DATE}`)
      .set("Authorization", authB.authorization)
      .expect(200);

    expect(response.body).toEqual({
      localDate: LOCAL_DATE,
      timezone: "America/New_York",
      attendance: { present: 0, absent: 0, late: 0, unmarked: 0 },
      pace: {
        ahead: 0,
        onTrack: 0,
        atRisk: 0,
        behind: 0,
        blocked: 0,
        stale: 0,
      },
      behaviour: { siteReview: 0, headReview: 0 },
    });
  });

  it("rejects a malformed calendar date", async () => {
    if (!app) return;

    await request(app.getHttpServer())
      .get("/ace/dashboard?date=2026-02-30")
      .set("Authorization", authA.authorization)
      .expect(400);
  });

  it("keeps the recorded pilot p95 below 500ms without timing sleeps", async () => {
    if (!app) return;

    await request(app.getHttpServer())
      .get(`/ace/dashboard?date=${LOCAL_DATE}`)
      .set("Authorization", authA.authorization)
      .expect(200);

    const durations: number[] = [];
    for (let sample = 0; sample < 20; sample += 1) {
      const startedAt = performance.now();
      await request(app.getHttpServer())
        .get(`/ace/dashboard?date=${LOCAL_DATE}`)
        .set("Authorization", authA.authorization)
        .expect(200);
      durations.push(performance.now() - startedAt);
    }

    const sorted = [...durations].sort((left, right) => left - right);
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]!;
    console.info(`[ace-dashboard] recorded pilot p95: ${p95.toFixed(2)}ms`);
    expect(p95).toBeLessThan(500);
  });
});

async function createPartialSiteFixture(input: {
  orgId: string;
  tenantId: string;
  actorUserId: string;
}): Promise<DashboardFixture> {
  const fixture = await withTenantRlsContext(
    input.tenantId,
    input.orgId,
    async (tx) => {
      const groupId = randomUUID();
      const childIds = [randomUUID(), randomUUID()];
      const subjectId = randomUUID();
      const enrollmentId = randomUUID();
      const progressId = randomUUID();
      const attendanceIds = [randomUUID(), randomUUID(), randomUUID()];

      await tx.group.create({
        data: { id: groupId, tenantId: input.tenantId, name: `ACE ${groupId}` },
      });
      await tx.child.createMany({
        data: childIds.map((id, index) => ({
          id,
          tenantId: input.tenantId,
          groupId,
          firstName: `Dashboard ${index}`,
          lastName: "Fixture",
        })),
      });
      await tx.subject.create({
        data: {
          id: subjectId,
          tenantId: input.tenantId,
          name: `ACE ${subjectId}`,
        },
      });
      await tx.studentSubjectEnrollment.create({
        data: {
          id: enrollmentId,
          tenantId: input.tenantId,
          childId: childIds[0]!,
          subjectId,
          startsOn: new Date("2026-03-01T00:00:00.000Z"),
          status: "ACTIVE",
          startingPace: 1,
          currentPace: 1,
          targetPace: 1,
          recordedByUserId: input.actorUserId,
          reason: "Dashboard fixture enrolment",
        },
      });
      await tx.paceProgress.create({
        data: {
          id: progressId,
          tenantId: input.tenantId,
          childId: childIds[0]!,
          subjectId,
          currentPace: 1,
          targetPace: 1,
          trackStatus: "ON_TRACK",
          rebuiltAt: new Date("2026-03-28T12:00:00.000Z"),
        },
      });
      await tx.attendance.createMany({
        data: [
          {
            id: attendanceIds[0]!,
            childId: childIds[0]!,
            groupId,
            present: true,
            status: "PRESENT",
            timestamp: new Date("2026-03-29T08:00:00.000Z"),
          },
          {
            id: attendanceIds[1]!,
            childId: childIds[0]!,
            groupId,
            present: true,
            status: "LATE",
            timestamp: new Date("2026-03-29T22:30:00.000Z"),
          },
          {
            id: attendanceIds[2]!,
            childId: childIds[0]!,
            groupId,
            present: false,
            status: "ABSENT",
            timestamp: new Date("2026-03-29T23:30:00.000Z"),
          },
        ],
      });
      await tx.behaviourCategory.createMany({
        data: [
          {
            tenantId: input.tenantId,
            policyVersion: 1,
            code: "conduct",
            label: "Conduct",
            type: "DEMERIT",
            visibility: "GENERAL",
            isActive: true,
            isSerious: true,
            sortOrder: 1,
            createdByUserId: input.actorUserId,
            reason: "Dashboard fixture policy",
          },
          {
            tenantId: input.tenantId,
            policyVersion: 1,
            code: "routine",
            label: "Routine",
            type: "DEMERIT",
            visibility: "GENERAL",
            isActive: true,
            isSerious: false,
            sortOrder: 2,
            createdByUserId: input.actorUserId,
            reason: "Dashboard fixture policy",
          },
        ],
      });
      await tx.demeritPolicy.create({
        data: {
          tenantId: input.tenantId,
          version: 1,
          windowDays: 30,
          stageOneThreshold: 3,
          stageTwoThreshold: 6,
          stageThreeThreshold: 10,
          seriousMisconductStage: 3,
          effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
          createdByUserId: input.actorUserId,
          reason: "Dashboard fixture policy",
        },
      });

      return {
        groupId,
        childIds,
        subjectId,
        enrollmentId,
        progressId,
        attendanceIds,
      };
    },
  );

  const actor = {
    tenantId: input.tenantId,
    orgId: input.orgId,
    userId: input.actorUserId,
  };
  const commands = behaviourCommandService();
  const sameAction = await commands.record(
    {
      idempotencyKey: randomUUID(),
      childId: fixture.childIds[0]!,
      category: "conduct",
      type: "DEMERIT",
      visibility: "GENERAL",
      pointsDelta: -1,
      occurredAt: "2026-03-28T12:00:00.000Z",
      reason: "Sensitive behaviour narrative",
      note: "Sensitive behaviour narrative",
    },
    actor,
  );
  const sameActionCorrection = await commands.correct(
    sameAction.entry.id,
    {
      idempotencyKey: randomUUID(),
      childId: fixture.childIds[0]!,
      category: "conduct",
      type: "DEMERIT",
      visibility: "GENERAL",
      pointsDelta: -2,
      occurredAt: "2026-03-29T12:30:00.000Z",
      reason: "Sensitive behaviour narrative corrected",
      note: "Sensitive behaviour narrative corrected",
    },
    actor,
  );
  const removedReview = await commands.record(
    {
      idempotencyKey: randomUUID(),
      childId: fixture.childIds[1]!,
      category: "conduct",
      type: "DEMERIT",
      visibility: "GENERAL",
      pointsDelta: -1,
      occurredAt: "2026-03-29T13:00:00.000Z",
      reason: "Review later removed by correction",
      note: "Sensitive behaviour narrative",
    },
    actor,
  );
  const removedReviewCorrection = await commands.correct(
    removedReview.entry.id,
    {
      idempotencyKey: randomUUID(),
      childId: fixture.childIds[1]!,
      category: "routine",
      type: "DEMERIT",
      visibility: "GENERAL",
      pointsDelta: -1,
      occurredAt: "2026-03-29T13:30:00.000Z",
      reason: "Correction no longer requires review",
    },
    actor,
  );

  const behaviourEntryIds = [
    sameAction.entry.id,
    sameActionCorrection.entry.id,
    removedReview.entry.id,
    removedReviewCorrection.entry.id,
  ];
  const outboxEventIds = (
    await prisma.outboxEvent.findMany({
      where: {
        orgId: input.orgId,
        aggregateId: { in: behaviourEntryIds },
      },
      select: { id: true },
    })
  ).map(({ id }) => id);

  return {
    ...fixture,
    behaviourEntryIds,
    behaviourCorrectionIds: [
      sameActionCorrection.entry.id,
      removedReviewCorrection.entry.id,
    ],
    retainedReviewSourceId: sameAction.entry.id,
    outboxEventIds,
  };
}

async function cleanupFixture(
  fixture: DashboardFixture,
  tenantId: string,
  orgId: string,
): Promise<void> {
  await prisma.outboxEvent.deleteMany({
    where: { id: { in: fixture.outboxEventIds } },
  });
  await prisma.auditEvent.deleteMany({
    where: { orgId, entityId: { in: fixture.behaviourEntryIds } },
  });
  await withTenantRlsContext(tenantId, orgId, async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL session_replication_role = replica");
    await tx.behaviourReviewRequest.deleteMany({ where: { tenantId } });
    await tx.behaviourEntry.deleteMany({
      where: { id: { in: fixture.behaviourEntryIds } },
    });
    await tx.behaviourCategory.deleteMany({ where: { tenantId } });
    await tx.demeritPolicy.deleteMany({ where: { tenantId } });
    await tx.$executeRawUnsafe("SET LOCAL session_replication_role = origin");
  });
  await prisma.paceProgress.deleteMany({ where: { id: fixture.progressId } });
  await prisma.studentSubjectEnrollment.deleteMany({
    where: { id: fixture.enrollmentId },
  });
  await prisma.subject.deleteMany({ where: { id: fixture.subjectId } });
  await prisma.attendance.deleteMany({
    where: { id: { in: fixture.attendanceIds } },
  });
  await prisma.child.deleteMany({ where: { id: { in: fixture.childIds } } });
  await prisma.group.deleteMany({ where: { id: fixture.groupId } });
}
