import { randomUUID } from "node:crypto";
import { ConflictException } from "@nestjs/common";
import {
  Prisma,
  PrismaClient,
  prisma,
  withTenantRlsContext,
} from "@pathway/db";
import { AceSettingsService } from "../../ace-settings/ace-settings.service";
import { BehaviourPolicyService } from "../behaviour-policy.service";
import {
  isDatabaseAvailable,
  requireDatabase,
} from "../../../test-helpers.e2e";

const SETTINGS_LOCK_PREFIX = "ace-settings";
const LOCK_WAIT_TIMEOUT_MS = 5_000;

interface Fixture {
  orgId: string;
  tenantId: string;
  actorId: string;
}

interface HeldSettingsLock {
  release(): Promise<void>;
}

function settingsLockKey(tenantId: string): string {
  return `${SETTINGS_LOCK_PREFIX}:${tenantId}`;
}

async function holdSettingsLock(tenantId: string): Promise<HeldSettingsLock> {
  let releaseLock: (() => void) | undefined;
  let markAcquired: (() => void) | undefined;
  const releaseSignal = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  const acquired = new Promise<void>((resolve) => {
    markAcquired = resolve;
  });
  const completion = prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${settingsLockKey(tenantId)}, 0)
          )
        `,
      );
      markAcquired?.();
      await releaseSignal;
    },
    { timeout: LOCK_WAIT_TIMEOUT_MS * 2 },
  );

  await Promise.race([
    acquired,
    completion.then(() => {
      throw new Error("ACE settings lock transaction ended early");
    }),
  ]);

  return {
    async release() {
      releaseLock?.();
      await completion;
    },
  };
}

async function waitingSettingsLocks(
  observer: PrismaClient,
  tenantId: string,
): Promise<number> {
  const [row] = await observer.$queryRaw<{ waitingCount: number }[]>(
    Prisma.sql`
      WITH lock_key AS (
        SELECT hashtextextended(${settingsLockKey(tenantId)}, 0) AS value
      )
      SELECT COUNT(*)::integer AS "waitingCount"
      FROM pg_catalog.pg_locks observed_lock
      CROSS JOIN lock_key
      WHERE observed_lock.locktype = 'advisory'
        AND observed_lock.granted = false
        AND observed_lock.classid::bigint =
          ((lock_key.value >> 32) & 4294967295)
        AND observed_lock.objid::bigint = (lock_key.value & 4294967295)
        AND observed_lock.objsubid = 1
    `,
  );
  return row?.waitingCount ?? 0;
}

async function waitFor(
  description: string,
  condition: () => Promise<boolean>,
): Promise<void> {
  const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function clearBehaviourPolicyFixtures(fixture: Fixture): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "PaceProgress",
      "PaceAssessment",
      "PacePolicyOverride",
      "PacePolicy",
      "BehaviourEntry",
      "DemeritStageOverride",
      "DemeritPolicy",
      "BehaviourCategory"
  `);
  await prisma.outboxEvent.deleteMany({ where: { aggregateId: fixture.tenantId } });
  await prisma.auditEvent.deleteMany({ where: { tenantId: fixture.tenantId } });
}

describe("ACE behaviour and settings demerit policy concurrency", () => {
  const lockObserver = new PrismaClient();
  let fixture: Fixture | undefined;

  beforeAll(async () => {
    if (!requireDatabase()) return;

    fixture = {
      orgId: randomUUID(),
      tenantId: randomUUID(),
      actorId: randomUUID(),
    };
    await prisma.org.create({
      data: {
        id: fixture.orgId,
        name: `ACE behaviour concurrency org ${fixture.orgId}`,
        slug: `ace-behaviour-concurrency-${fixture.orgId}`,
        planCode: "trial",
      },
    });
    await prisma.tenant.create({
      data: {
        id: fixture.tenantId,
        orgId: fixture.orgId,
        name: `ACE behaviour concurrency tenant ${fixture.tenantId}`,
        slug: `ace-behaviour-concurrency-${fixture.tenantId}`,
        timezone: "Europe/London",
      },
    });
    await withTenantRlsContext(fixture.tenantId, fixture.orgId, async (tx) => {
      await tx.user.create({
        data: {
          id: fixture!.actorId,
          email: `${fixture!.actorId}@example.test`,
          tenantId: fixture!.tenantId,
        },
      });
      await tx.siteMembership.create({
        data: { tenantId: fixture!.tenantId, userId: fixture!.actorId },
      });
      await tx.pacePolicy.create({
        data: {
          tenantId: fixture!.tenantId,
          version: 1,
          selfTestPassingScore: 80,
          paceTestPassingScore: 80,
          maxAssessmentsPerDay: 2,
          allowSamePaceSameDay: false,
          effectiveFrom: new Date(Date.now() - 1_000),
          createdByUserId: fixture!.actorId,
          reason: "Initial PACE policy",
        },
      });
      await tx.demeritPolicy.create({
        data: {
          tenantId: fixture!.tenantId,
          version: 1,
          windowDays: 30,
          stageOneThreshold: 3,
          stageTwoThreshold: 6,
          stageThreeThreshold: 9,
          seriousMisconductStage: 3,
          effectiveFrom: new Date(Date.now() - 1_000),
          createdByUserId: fixture!.actorId,
          reason: "Initial demerit policy",
        },
      });
    });
  });

  afterAll(async () => {
    await lockObserver.$disconnect();
    if (!isDatabaseAvailable() || !fixture) return;

    await clearBehaviourPolicyFixtures(fixture);
    await prisma.siteMembership.deleteMany({ where: { userId: fixture.actorId } });
    await prisma.user.deleteMany({ where: { id: fixture.actorId } });
    await prisma.tenant.deleteMany({ where: { id: fixture.tenantId } });
    await prisma.org.deleteMany({ where: { id: fixture.orgId } });
  });

  it("allows only one settings or behaviour command using the same stale demerit version", async () => {
    if (!isDatabaseAvailable() || !fixture) return;

    const actor = {
      tenantId: fixture.tenantId,
      orgId: fixture.orgId,
      userId: fixture.actorId,
    };
    const settingsService = new AceSettingsService();
    const behaviourService = new BehaviourPolicyService();
    const lock = await holdSettingsLock(fixture.tenantId);
    const settingsUpdate = settingsService.update(
      {
        reason: "Update demerit thresholds",
        expectedPacePolicyVersion: 1,
        expectedDemeritPolicyVersion: 1,
        demeritPolicy: {
          windowDays: 21,
          stageOneThreshold: 2,
          stageTwoThreshold: 4,
          stageThreeThreshold: 6,
          seriousMisconductStage: 3,
        },
      },
      actor,
    );
    const behaviourUpdate = behaviourService.update(
      {
        reason: "Update behaviour categories and stages",
        expectedCategoryVersion: 0,
        expectedDemeritPolicyVersion: 1,
        categories: [
          {
            code: "service",
            label: "Service",
            type: "MERIT",
            visibility: "GENERAL",
            isActive: true,
            isSerious: false,
            sortOrder: 1,
          },
          {
            code: "bullying",
            label: "Bullying",
            type: "DEMERIT",
            visibility: "SENSITIVE",
            isActive: true,
            isSerious: true,
            sortOrder: 2,
          },
          {
            code: "pastoral-check-in",
            label: "Pastoral check-in",
            type: "GENERAL",
            visibility: "SENSITIVE",
            isActive: false,
            isSerious: false,
            sortOrder: 3,
          },
        ],
        demeritPolicy: {
          windowDays: 21,
          stageOneThreshold: 2,
          stageTwoThreshold: 5,
          stageThreeThreshold: 8,
          seriousMisconductStage: 3,
        },
      },
      actor,
    );

    let results: PromiseSettledResult<unknown>[];
    try {
      await waitFor("both policy services waiting on the shared lock", async () =>
        (await waitingSettingsLocks(lockObserver, fixture!.tenantId)) === 2,
      );
    } finally {
      await lock.release();
      results = await Promise.allSettled([settingsUpdate, behaviourUpdate]);
    }

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(ConflictException);

    const demeritVersions = await prisma.demeritPolicy.findMany({
      where: { tenantId: fixture.tenantId },
      select: { version: true },
      orderBy: { version: "asc" },
    });
    expect(demeritVersions).toEqual([{ version: 1 }, { version: 2 }]);
  });
});
