import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { ExecutionContext, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import { prisma, withTenantRlsContext } from "@pathway/db";
import request from "supertest";
import { AppModule } from "../../app.module";
import { AuthUserGuard } from "../../auth/auth-user.guard";
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
  outboxEventIds: string[];
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
    if (!app) return;

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
      behaviour: { siteReview: 1, headReview: 0 },
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
  return withTenantRlsContext(input.tenantId, input.orgId, async (tx) => {
    const groupId = randomUUID();
    const childIds = [randomUUID(), randomUUID()];
    const subjectId = randomUUID();
    const enrollmentId = randomUUID();
    const progressId = randomUUID();
    const attendanceIds = [randomUUID(), randomUUID()];
    const behaviourEntryIds = [randomUUID(), randomUUID()];
    const outboxEventIds = [randomUUID(), randomUUID()];

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
          status: "LATE",
          timestamp: new Date("2026-03-29T22:30:00.000Z"),
        },
        {
          id: attendanceIds[1]!,
          childId: childIds[0]!,
          groupId,
          present: false,
          status: "ABSENT",
          timestamp: new Date("2026-03-29T23:30:00.000Z"),
        },
      ],
    });
    await tx.behaviourEntry.create({
      data: {
        id: behaviourEntryIds[0]!,
        tenantId: input.tenantId,
        childId: childIds[0]!,
        type: "DEMERIT",
        category: "review",
        pointsDelta: -1,
        occurredAt: new Date("2026-03-29T12:00:00.000Z"),
        recordedByUserId: input.actorUserId,
        reason: "Sensitive behaviour narrative",
        note: "Sensitive behaviour narrative",
      },
    });
    await tx.behaviourEntry.create({
      data: {
        id: behaviourEntryIds[1]!,
        tenantId: input.tenantId,
        childId: childIds[0]!,
        type: "DEMERIT",
        category: "review-corrected",
        pointsDelta: -1,
        occurredAt: new Date("2026-03-29T12:00:00.000Z"),
        recordedByUserId: input.actorUserId,
        reason: "Sensitive behaviour narrative corrected",
        note: "Sensitive behaviour narrative corrected",
        correctsBehaviourEntryId: behaviourEntryIds[0]!,
      },
    });

    const reviewPayload = (behaviourEntryId: string) => ({
      behaviourEntryId,
      childId: childIds[0]!,
      tenantId: input.tenantId,
      orgId: input.orgId,
      stage: 1,
      demeritPolicyVersion: 1,
      occurredOn: LOCAL_DATE,
      recipientUserIds: [input.actorUserId],
      reviewKind: "SITE",
    });
    await tx.outboxEvent.createMany({
      data: behaviourEntryIds.map((behaviourEntryId, index) => ({
        id: outboxEventIds[index]!,
        orgId: input.orgId,
        aggregateType: "BEHAVIOUR_ENTRY",
        aggregateId: behaviourEntryId,
        eventType: "behaviour.review-requested",
        payload: reviewPayload(behaviourEntryId),
        idempotencyKey: `ace-dashboard-${behaviourEntryId}`,
        createdAt: new Date("2026-03-29T12:00:00.000Z"),
      })),
    });

    return {
      groupId,
      childIds,
      subjectId,
      enrollmentId,
      progressId,
      attendanceIds,
      behaviourEntryIds,
      outboxEventIds,
    };
  });
}

async function cleanupFixture(
  fixture: DashboardFixture,
  tenantId: string,
  orgId: string,
): Promise<void> {
  await prisma.outboxEvent.deleteMany({
    where: { id: { in: fixture.outboxEventIds } },
  });
  await withTenantRlsContext(tenantId, orgId, async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL session_replication_role = replica");
    await tx.behaviourEntry.deleteMany({
      where: { id: { in: fixture.behaviourEntryIds } },
    });
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
