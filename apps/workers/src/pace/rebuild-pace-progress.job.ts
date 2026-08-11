import {
  comparePaceNumbers,
  parsePaceNumber,
  rebuildPaceProgress,
  type PaceAssessmentFact,
} from "@pathway/ace-domain";
import { Prisma, prisma, withTenantRlsContext } from "@pathway/db";

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 500;
const MAX_FACTS_PER_ENROLLMENT = 500;

type AssessmentType = "SELF_TEST" | "PACE_TEST";
type AssessmentResult = "PASSED" | "FAILED";
type TrackStatus = "AHEAD" | "ON_TRACK" | "BEHIND";

interface TenantContext {
  id: string;
  orgId: string;
}

interface EnrollmentRecord {
  id: string;
  tenantId: string;
  childId: string;
  subjectId: string;
  startingPace: number;
  targetPace: number;
}

interface AssessmentRecord {
  id: string;
  childId: string;
  subjectId: string;
  paceNumber: number;
  assessmentType: AssessmentType;
  result: AssessmentResult;
  assessedOn: Date;
  correctsAssessmentId: string | null;
  policyOverrideId: string | null;
  createdAt: Date;
}

interface ExistingProjectionRecord {
  childId: string;
  subjectId: string;
  trackStatus: "AHEAD" | "ON_TRACK" | "AT_RISK" | "BEHIND" | "BLOCKED";
  blockCode: string | null;
}

export interface PaceProgressRebuildClient {
  tenant: {
    findMany(args: unknown): Promise<TenantContext[]>;
  };
}

export interface PaceProgressRebuildTransaction {
  studentSubjectEnrollment: {
    findMany(args: unknown): Promise<EnrollmentRecord[]>;
  };
  paceProgress: {
    findMany(args: unknown): Promise<ExistingProjectionRecord[]>;
    upsert(args: unknown): Promise<unknown>;
  };
  $queryRaw<T>(query: unknown): Promise<T>;
  $executeRaw(query: unknown): Promise<number>;
}

export interface BatchResult {
  scanned: number;
  rebuilt: number;
  skippedUnrebuildable: number;
  skippedFactHistory: number;
  lastEnrollmentId: string | null;
}

export type PaceProgressTenantRunner = (
  tenantId: string,
  orgId: string,
  callback: (tx: PaceProgressRebuildTransaction) => Promise<BatchResult>,
) => Promise<BatchResult>;

export interface RebuildPaceProgressOptions {
  batchSize?: number;
}

export interface RebuildPaceProgressResult {
  tenants: number;
  batches: number;
  scanned: number;
  rebuilt: number;
  skippedUnrebuildable: number;
  skippedFactHistory: number;
}

const productionClient: PaceProgressRebuildClient = {
  tenant: {
    findMany: (args) =>
      prisma.tenant.findMany(
        args as Parameters<typeof prisma.tenant.findMany>[0],
      ),
  },
};

const productionTenantRunner: PaceProgressTenantRunner = (
  tenantId,
  orgId,
  callback,
) =>
  withTenantRlsContext(tenantId, orgId, (tx) =>
    callback(tx as unknown as PaceProgressRebuildTransaction),
  );

export class RebuildPaceProgressJob {
  constructor(
    private readonly client: PaceProgressRebuildClient = productionClient,
    private readonly runForTenant: PaceProgressTenantRunner = productionTenantRunner,
  ) {}

  async run(
    options: RebuildPaceProgressOptions = {},
  ): Promise<RebuildPaceProgressResult> {
    const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    assertBatchSize(batchSize);
    const tenants = await this.client.tenant.findMany({
      select: { id: true, orgId: true },
      orderBy: { id: "asc" },
    });
    const result: RebuildPaceProgressResult = {
      tenants: tenants.length,
      batches: 0,
      scanned: 0,
      rebuilt: 0,
      skippedUnrebuildable: 0,
      skippedFactHistory: 0,
    };

    for (const tenant of tenants) {
      let lastEnrollmentId: string | null = null;
      while (true) {
        const batch = await this.runForTenant(tenant.id, tenant.orgId, (tx) =>
          rebuildBatch(tx, tenant.id, lastEnrollmentId, batchSize),
        );
        if (batch.scanned === 0) break;
        result.scanned += batch.scanned;
        result.rebuilt += batch.rebuilt;
        result.skippedUnrebuildable += batch.skippedUnrebuildable;
        result.skippedFactHistory += batch.skippedFactHistory;
        result.batches += 1;
        lastEnrollmentId = batch.lastEnrollmentId;
        if (batch.scanned < batchSize) break;
      }
    }

    return result;
  }
}

async function rebuildBatch(
  tx: PaceProgressRebuildTransaction,
  tenantId: string,
  lastEnrollmentId: string | null,
  batchSize: number,
): Promise<BatchResult> {
  const enrollments = await tx.studentSubjectEnrollment.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
      ...(lastEnrollmentId ? { id: { gt: lastEnrollmentId } } : {}),
    },
    orderBy: { id: "asc" },
    take: batchSize,
    select: {
      id: true,
      tenantId: true,
      childId: true,
      subjectId: true,
      startingPace: true,
      targetPace: true,
    },
  });
  if (enrollments.length === 0) {
    return {
      scanned: 0,
      rebuilt: 0,
      skippedUnrebuildable: 0,
      skippedFactHistory: 0,
      lastEnrollmentId: null,
    };
  }

  await acquireAggregateLocks(tx, tenantId, enrollments);
  const existingProjections = await tx.paceProgress.findMany({
    where: {
      tenantId,
      OR: enrollments.map(({ childId, subjectId }) => ({ childId, subjectId })),
    },
    select: {
      childId: true,
      subjectId: true,
      trackStatus: true,
      blockCode: true,
    },
  });
  const unrebuildableKeys = new Set(
    existingProjections.filter(isUnrebuildableProjection).map(projectionKey),
  );
  const factCandidates = enrollments.filter(
    (enrollment) => !unrebuildableKeys.has(projectionKey(enrollment)),
  );
  const assessments = factCandidates.length
    ? await readBoundedAssessmentFacts(tx, tenantId, factCandidates)
    : [];
  const factsByEnrollment = groupFacts(assessments);
  const oversizedHistoryKeys = new Set(
    [...factsByEnrollment]
      .filter(([, facts]) => facts.length > MAX_FACTS_PER_ENROLLMENT)
      .map(([key]) => key),
  );
  const rebuiltAt = latestInstant(
    new Date(),
    assessments.map((assessment) => assessment.createdAt),
  );
  let rebuilt = 0;

  for (const enrollment of enrollments) {
    const key = projectionKey(enrollment);
    if (unrebuildableKeys.has(key) || oversizedHistoryKeys.has(key)) continue;
    const facts = factsByEnrollment.get(key) ?? [];
    const domainFacts = facts.map(toDomainFact);
    const terminalFacts = terminalFactsFrom(domainFacts);
    const projection = rebuildPaceProgress({
      assignedLevel: parsePaceNumber(enrollment.startingPace).level,
      startingPace: enrollment.startingPace,
      assessmentFacts: domainFacts,
    });
    const data = {
      currentPace: projection.currentPace.raw,
      targetPace: enrollment.targetPace,
      completedPaces: terminalFacts.filter(isCompletedFinalTest).length,
      trackStatus: toTrackStatus(
        projection.currentPace.raw,
        enrollment.targetPace,
      ),
      blockCode: null,
      lastAssessmentId: terminalFacts.at(-1)?.id ?? null,
      rebuiltAt,
    };
    await tx.paceProgress.upsert({
      where: {
        tenantId_childId_subjectId: {
          tenantId,
          childId: enrollment.childId,
          subjectId: enrollment.subjectId,
        },
      },
      create: {
        tenantId,
        childId: enrollment.childId,
        subjectId: enrollment.subjectId,
        ...data,
      },
      update: data,
    });
    rebuilt += 1;
  }

  return {
    scanned: enrollments.length,
    rebuilt,
    skippedUnrebuildable: unrebuildableKeys.size,
    skippedFactHistory: oversizedHistoryKeys.size,
    lastEnrollmentId: enrollments.at(-1)?.id ?? null,
  };
}

async function acquireAggregateLocks(
  tx: PaceProgressRebuildTransaction,
  tenantId: string,
  enrollments: readonly EnrollmentRecord[],
): Promise<void> {
  const childIds = [
    ...new Set(enrollments.map(({ childId }) => childId)),
  ].sort();
  for (const childId of childIds) {
    const lockKey = `ace-pace-assessment:${tenantId}:${childId}`;
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
    );
  }
}

async function readBoundedAssessmentFacts(
  tx: PaceProgressRebuildTransaction,
  tenantId: string,
  enrollments: readonly EnrollmentRecord[],
): Promise<AssessmentRecord[]> {
  const requestedPairs = Prisma.join(
    enrollments.map(
      ({ childId, subjectId }) =>
        Prisma.sql`(${childId}::text, ${subjectId}::text)`,
    ),
  );
  return tx.$queryRaw<AssessmentRecord[]>(Prisma.sql`
    WITH requested("childId", "subjectId") AS (
      VALUES ${requestedPairs}
    ), ranked AS (
      SELECT
        fact.id,
        fact."childId",
        fact."subjectId",
        fact."paceNumber",
        fact."assessmentType",
        fact.result,
        fact."assessedOn",
        fact."correctsAssessmentId",
        fact."policyOverrideId",
        fact."createdAt",
        ROW_NUMBER() OVER (
          PARTITION BY fact."childId", fact."subjectId"
          ORDER BY fact."assessedOn" ASC, fact.id ASC
        ) AS "factRow"
      FROM "PaceAssessment" AS fact
      INNER JOIN requested
        ON requested."childId" = fact."childId"
        AND requested."subjectId" = fact."subjectId"
      WHERE fact."tenantId" = ${tenantId}
    )
    SELECT
      ranked.id,
      ranked."childId",
      ranked."subjectId",
      ranked."paceNumber",
      ranked."assessmentType",
      ranked.result,
      ranked."assessedOn",
      ranked."correctsAssessmentId",
      ranked."policyOverrideId",
      ranked."createdAt"
    FROM ranked
    WHERE ranked."factRow" <= ${MAX_FACTS_PER_ENROLLMENT + 1}
    ORDER BY
      ranked."childId" ASC,
      ranked."subjectId" ASC,
      ranked."assessedOn" ASC,
      ranked.id ASC
  `);
}

function groupFacts(
  assessments: readonly AssessmentRecord[],
): Map<string, AssessmentRecord[]> {
  const grouped = new Map<string, AssessmentRecord[]>();
  for (const assessment of assessments) {
    const key = projectionKey(assessment);
    const facts = grouped.get(key) ?? [];
    facts.push(assessment);
    grouped.set(key, facts);
  }
  return grouped;
}

function projectionKey(value: { childId: string; subjectId: string }): string {
  return `${value.childId}:${value.subjectId}`;
}

function isUnrebuildableProjection(
  projection: ExistingProjectionRecord,
): boolean {
  return (
    projection.trackStatus === "AT_RISK" ||
    projection.trackStatus === "BLOCKED" ||
    projection.blockCode !== null
  );
}

function latestInstant(now: Date, factsCreatedAt: readonly Date[]): Date {
  return new Date(
    Math.max(now.getTime(), ...factsCreatedAt.map((value) => value.getTime())),
  );
}

function toDomainFact(assessment: AssessmentRecord): PaceAssessmentFact {
  return {
    id: assessment.id,
    paceNumber: assessment.paceNumber,
    assessmentType:
      assessment.assessmentType === "SELF_TEST" ? "SelfTest" : "FinalTest",
    result: assessment.result === "PASSED" ? "passed" : "failed",
    assessedOn: assessment.assessedOn.toISOString().slice(0, 10),
    ...(assessment.correctsAssessmentId
      ? { correctsFactId: assessment.correctsAssessmentId }
      : {}),
    ...(assessment.policyOverrideId ? { hasAuthorisedOverride: true } : {}),
  };
}

function terminalFactsFrom(
  facts: readonly PaceAssessmentFact[],
): PaceAssessmentFact[] {
  const correctedIds = new Set(
    facts.flatMap((fact) => (fact.correctsFactId ? [fact.correctsFactId] : [])),
  );
  return facts
    .filter((fact) => !correctedIds.has(fact.id))
    .sort(
      (left, right) =>
        left.assessedOn.localeCompare(right.assessedOn) ||
        left.id.localeCompare(right.id),
    );
}

function isCompletedFinalTest(fact: PaceAssessmentFact): boolean {
  return (
    fact.assessmentType === "FinalTest" &&
    (fact.result === "passed" || fact.hasAuthorisedOverride === true)
  );
}

function toTrackStatus(currentPace: number, targetPace: number): TrackStatus {
  const comparison = comparePaceNumbers(
    parsePaceNumber(currentPace),
    parsePaceNumber(targetPace),
  );
  if (comparison > 0) return "AHEAD";
  if (comparison < 0) return "BEHIND";
  return "ON_TRACK";
}

function assertBatchSize(batchSize: number): void {
  if (
    !Number.isInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > MAX_BATCH_SIZE
  ) {
    throw new RangeError(
      `PACE progress rebuild batchSize must be between 1 and ${MAX_BATCH_SIZE}`,
    );
  }
}
