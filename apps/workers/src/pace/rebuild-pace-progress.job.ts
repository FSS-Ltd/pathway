import {
  comparePaceNumbers,
  parsePaceNumber,
  rebuildPaceProgress,
  type PaceAssessmentFact,
} from "@pathway/ace-domain";
import { prisma, withTenantRlsContext } from "@pathway/db";

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 500;

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
  currentPace: number;
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
  paceAssessment: {
    findMany(args: unknown): Promise<AssessmentRecord[]>;
  };
  paceProgress: {
    upsert(args: unknown): Promise<unknown>;
  };
}

export interface BatchResult {
  processed: number;
  lastEnrollmentId: string | null;
}

export type PaceProgressTenantRunner = (
  tenantId: string,
  orgId: string,
  callback: (tx: PaceProgressRebuildTransaction) => Promise<BatchResult>,
) => Promise<BatchResult>;

export interface RebuildPaceProgressOptions {
  batchSize?: number;
  rebuiltAt?: Date;
}

export interface RebuildPaceProgressResult {
  tenants: number;
  enrollments: number;
  batches: number;
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
    const rebuiltAt = options.rebuiltAt ?? new Date();
    const tenants = await this.client.tenant.findMany({
      select: { id: true, orgId: true },
      orderBy: { id: "asc" },
    });
    const result = { tenants: tenants.length, enrollments: 0, batches: 0 };

    for (const tenant of tenants) {
      let lastEnrollmentId: string | null = null;
      while (true) {
        const batch = await this.runForTenant(tenant.id, tenant.orgId, (tx) =>
          rebuildBatch(tx, tenant.id, lastEnrollmentId, batchSize, rebuiltAt),
        );
        if (batch.processed === 0) break;
        result.enrollments += batch.processed;
        result.batches += 1;
        lastEnrollmentId = batch.lastEnrollmentId;
        if (batch.processed < batchSize) break;
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
  rebuiltAt: Date,
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
      currentPace: true,
      targetPace: true,
    },
  });
  if (enrollments.length === 0) {
    return { processed: 0, lastEnrollmentId: null };
  }

  const assessments = await tx.paceAssessment.findMany({
    where: {
      tenantId,
      OR: enrollments.map(({ childId, subjectId }) => ({ childId, subjectId })),
    },
    orderBy: [{ assessedOn: "asc" }, { id: "asc" }],
    select: {
      id: true,
      childId: true,
      subjectId: true,
      paceNumber: true,
      assessmentType: true,
      result: true,
      assessedOn: true,
      correctsAssessmentId: true,
      policyOverrideId: true,
    },
  });
  const factsByEnrollment = groupFacts(assessments);

  for (const enrollment of enrollments) {
    const facts = factsByEnrollment.get(enrollmentKey(enrollment)) ?? [];
    const domainFacts = facts.map(toDomainFact);
    const terminalFacts = terminalFactsFrom(domainFacts);
    const projection = rebuildPaceProgress({
      assignedLevel: parsePaceNumber(enrollment.startingPace).level,
      startingPace: enrollment.currentPace,
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
  }

  return {
    processed: enrollments.length,
    lastEnrollmentId: enrollments.at(-1)?.id ?? null,
  };
}

function groupFacts(
  assessments: readonly AssessmentRecord[],
): Map<string, AssessmentRecord[]> {
  const grouped = new Map<string, AssessmentRecord[]>();
  for (const assessment of assessments) {
    const key = enrollmentKey(assessment);
    const facts = grouped.get(key) ?? [];
    facts.push(assessment);
    grouped.set(key, facts);
  }
  return grouped;
}

function enrollmentKey(value: { childId: string; subjectId: string }): string {
  return `${value.childId}:${value.subjectId}`;
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
