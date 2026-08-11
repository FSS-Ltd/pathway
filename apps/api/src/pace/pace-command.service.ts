import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  evaluatePaceAssessment,
  rebuildPaceProgress,
} from "@pathway/ace-domain";
import {
  Prisma,
  withTenantRlsContext,
  type Prisma as PrismaTypes,
} from "@pathway/db";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { OutboxService } from "../common/outbox/outbox.service";
import type { CreatePaceAssessmentDto } from "./dto/create-pace-assessment.dto";
import type {
  PaceAssessmentCorrectionDto,
  PacePolicyOverrideDto,
} from "./dto/pace-correction.dto";
import { parseRecordedPaceCommandResult } from "./pace-command-replay";
import {
  assessmentSelect,
  assessmentConflict,
  clientCommandLockKey,
  commandIdempotencyKey,
  commandIdempotencyScope,
  formatDatabaseDate,
  idempotencyConflict,
  isIanaTimezone,
  localDateAt,
  overrideClientCommandKeyHash,
  paceOverrideAssessmentFingerprint,
  parsePaceOrThrow,
  policyBlocked,
  policyOverrideInvalid,
  progressSelect,
  rebuildProgressRecord,
  terminalAssessmentRecords,
  toCommandResponse,
  toDatabaseAssessmentType,
  toDatabaseDate,
  toTerminalDomainFacts,
  type AssessmentRecord,
  type DatabaseAssessmentResult,
  type PaceCommandResponse,
  type ProgressRecord,
} from "./pace-command.support";

export interface PaceCommandActor {
  tenantId: string;
  orgId: string;
  userId: string;
  stepUp?: {
    authenticatedAt: string;
    secondFactor: true;
  };
}

export interface PaceCorrectionResponse extends PaceCommandResponse {
  assessment: PaceCommandResponse["assessment"] & {
    correctsAssessmentId: string;
  };
}

export interface PacePolicyOverrideResponse {
  id: string;
  childId: string;
  subjectId: string;
  pacePolicyId: string;
  policyCode: PacePolicyOverrideDto["policyCode"];
  authorisedByUserId: string;
  expiresAt: string;
  createdAt: string;
}

const STEP_UP_MAX_AGE_MS = 5 * 60 * 1_000;
const OVERRIDE_MAX_TTL_MS = 15 * 60 * 1_000;

@Injectable()
export class PaceCommandService {
  constructor(
    @Inject(OutboxService)
    private readonly outbox: OutboxService,
  ) {}

  async record(
    command: CreatePaceAssessmentDto,
    actor: PaceCommandActor,
  ): Promise<PaceCommandResponse> {
    this.assertActor(actor);
    this.assertCommand(command);
    const assessedAt = new Date(command.assessedAt);

    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const site = await this.requireActiveSite(tx, actor);
      const assessedOn = localDateAt(assessedAt, site.timezone);
      const assessedOnDate = toDatabaseDate(assessedOn);
      const idempotencyScope = commandIdempotencyScope(
        actor.tenantId,
        command.idempotencyKey,
      );
      const outboxIdempotencyKey = commandIdempotencyKey(
        idempotencyScope,
        command,
        actor.userId,
        assessedOn,
      );
      await this.acquireCommandLocks(
        tx,
        actor.tenantId,
        command.childId,
        command.idempotencyKey,
      );
      const existingIntent = await tx.outboxEvent.findFirst({
        where: { idempotencyKey: { startsWith: `${idempotencyScope}:` } },
        select: { aggregateId: true, idempotencyKey: true },
      });
      if (existingIntent) {
        if (existingIntent.idempotencyKey !== outboxIdempotencyKey) {
          throw idempotencyConflict();
        }
        return this.readRecordedResult(
          tx,
          actor.tenantId,
          existingIntent.aggregateId,
        );
      }

      const assessmentType = toDatabaseAssessmentType(command.assessmentType);
      const enrollment = await tx.studentSubjectEnrollment.findFirst({
        where: {
          tenantId: actor.tenantId,
          childId: command.childId,
          subjectId: command.subjectId,
          status: "ACTIVE",
          startsOn: { lte: assessedOnDate },
          OR: [{ endsOn: null }, { endsOn: { gte: assessedOnDate } }],
        },
        select: {
          startingPace: true,
          currentPace: true,
          targetPace: true,
        },
      });
      if (!enrollment) {
        throw new NotFoundException(
          "Active student subject placement not found",
        );
      }

      const policy = await tx.pacePolicy.findFirst({
        where: {
          tenantId: actor.tenantId,
          effectiveFrom: { lte: assessedAt },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: assessedAt } }],
        },
        orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
        select: {
          id: true,
          selfTestPassingScore: true,
          paceTestPassingScore: true,
          maxAssessmentsPerDay: true,
          allowSamePaceSameDay: true,
        },
      });
      if (!policy) throw new NotFoundException("Active PACE policy not found");

      const storedFacts = (await tx.paceAssessment.findMany({
        where: {
          tenantId: actor.tenantId,
          childId: command.childId,
          subjectId: command.subjectId,
        },
        orderBy: [{ assessedOn: "asc" }, { id: "asc" }],
        select: assessmentSelect,
      })) as AssessmentRecord[];
      const duplicate = terminalAssessmentRecords(storedFacts).find(
        (fact) =>
          fact.paceNumber === command.paceNumber &&
          fact.assessmentType === assessmentType &&
          formatDatabaseDate(fact.assessedOn) === assessedOn,
      );
      if (duplicate) {
        if (
          duplicate.score !== command.score ||
          duplicate.reason !== command.reason.trim() ||
          duplicate.recordedByUserId !== actor.userId ||
          duplicate.policyOverrideId !== (command.policyOverrideId ?? null)
        ) {
          throw assessmentConflict();
        }
        return this.readRecordedResult(tx, actor.tenantId, duplicate.id);
      }

      const terminalFacts = toTerminalDomainFacts(storedFacts);
      const dailyTestCount = await this.countDailyTerminalFacts(
        tx,
        actor.tenantId,
        command.childId,
        assessedOnDate,
      );
      const assessedPace = parsePaceOrThrow(command.paceNumber);
      const currentProjection = rebuildPaceProgress({
        assignedLevel: parsePaceOrThrow(enrollment.startingPace).level,
        startingPace: enrollment.currentPace,
        assessmentFacts: terminalFacts,
      });
      const policyInput = {
        assessmentType: command.assessmentType,
        score: command.score,
        passThreshold:
          command.assessmentType === "SelfTest"
            ? policy.selfTestPassingScore
            : policy.paceTestPassingScore,
        assessedPace,
        currentPace: currentProjection.currentPace,
        dailyTestCount,
        dailyTestLimitEnabled: true,
        dailyTestLimit: policy.maxAssessmentsPerDay,
        samePaceSameDayBlockEnabled: !policy.allowSamePaceSameDay,
        hasExistingSelfTest: terminalFacts.some(
          (fact) =>
            fact.assessmentType === "SelfTest" &&
            fact.paceNumber === command.paceNumber,
        ),
        hasRequiredSelfTest: terminalFacts.some(
          (fact) =>
            fact.assessmentType === "SelfTest" &&
            fact.paceNumber === command.paceNumber,
        ),
        hasOppositeTypeAssessmentOnSameDay: terminalFacts.some(
          (fact) =>
            fact.paceNumber === command.paceNumber &&
            fact.assessedOn === assessedOn &&
            fact.assessmentType !== command.assessmentType,
        ),
      };
      let policyResult = evaluatePaceAssessment({
        ...policyInput,
        hasAuthorisedOverride: false,
      });
      if (command.policyOverrideId) {
        const assessmentFingerprint = paceOverrideAssessmentFingerprint(
          actor.tenantId,
          command,
        );
        const policyOverride = await tx.pacePolicyOverride.findFirst({
          where: {
            id: command.policyOverrideId,
            tenantId: actor.tenantId,
            childId: command.childId,
            subjectId: command.subjectId,
            pacePolicyId: policy.id,
            policyCode: policyResult.code,
            assessmentFingerprint,
            expiresAt: { gt: new Date() },
            assessments: { none: {} },
          },
          select: { id: true },
        });
        if (!policyOverride) throw policyOverrideInvalid();
        policyResult = evaluatePaceAssessment({
          ...policyInput,
          hasAuthorisedOverride: true,
        });
      }
      if (policyResult.decision === "block")
        throw policyBlocked(policyResult.code);

      const result: DatabaseAssessmentResult =
        command.score >=
        (command.assessmentType === "SelfTest"
          ? policy.selfTestPassingScore
          : policy.paceTestPassingScore)
          ? "PASSED"
          : "FAILED";
      const fact = (await tx.paceAssessment.create({
        data: {
          tenantId: actor.tenantId,
          childId: command.childId,
          subjectId: command.subjectId,
          paceNumber: command.paceNumber,
          assessmentType,
          score: command.score,
          result,
          assessedOn: assessedOnDate,
          recordedByUserId: actor.userId,
          reason: command.reason.trim(),
          policyOverrideId: command.policyOverrideId,
        },
        select: assessmentSelect,
      })) as AssessmentRecord;
      const rebuiltProgress = rebuildProgressRecord(
        enrollment,
        [...storedFacts, fact],
        policyResult,
        fact.createdAt,
      );
      const progress = (await tx.paceProgress.upsert({
        where: {
          tenantId_childId_subjectId: {
            tenantId: actor.tenantId,
            childId: command.childId,
            subjectId: command.subjectId,
          },
        },
        create: {
          tenantId: actor.tenantId,
          childId: command.childId,
          subjectId: command.subjectId,
          ...rebuiltProgress,
        },
        update: {
          ...rebuiltProgress,
        },
        select: progressSelect,
      })) as ProgressRecord;

      await recordAuditEventInTransaction(tx, {
        actorUserId: actor.userId,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        entityType: AuditEntityType.ACE_RECORD,
        entityId: fact.id,
        action: AuditAction.CREATED,
        metadata: {
          assessmentType: command.assessmentType,
          paceNumber: command.paceNumber,
          policyDecision: policyResult.decision,
          policyCode: policyResult.code,
          policyNextPace: policyResult.nextPace?.raw ?? null,
          policyOverrideId: command.policyOverrideId ?? null,
          progress: {
            ...progress,
            rebuiltAt: progress.rebuiltAt.toISOString(),
          },
        },
      });
      await this.outbox.enqueue(tx, {
        aggregateType: "PACE_ASSESSMENT",
        aggregateId: fact.id,
        eventType: "ace.pace.assessment-recorded",
        payload: {},
        idempotencyKey: outboxIdempotencyKey,
      });

      return toCommandResponse(fact, progress, policyResult, false);
    });
  }

  async correct(
    assessmentId: string,
    command: PaceAssessmentCorrectionDto,
    actor: PaceCommandActor,
  ): Promise<PaceCorrectionResponse> {
    this.assertActor(actor);
    this.assertCorrection(assessmentId, command);
    const assessedAt = new Date(command.assessedAt);

    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const site = await this.requireActiveSite(tx, actor);
      const assessedOn = localDateAt(assessedAt, site.timezone);
      const assessedOnDate = toDatabaseDate(assessedOn);
      await this.acquireAggregateLock(tx, actor.tenantId, command.childId);

      const original = (await tx.paceAssessment.findFirst({
        where: {
          id: assessmentId,
          tenantId: actor.tenantId,
          childId: command.childId,
          subjectId: command.subjectId,
        },
        select: assessmentSelect,
      })) as AssessmentRecord | null;
      if (!original) throw new NotFoundException("PACE assessment not found");

      const enrollment = await tx.studentSubjectEnrollment.findFirst({
        where: {
          tenantId: actor.tenantId,
          childId: command.childId,
          subjectId: command.subjectId,
          status: "ACTIVE",
          startsOn: { lte: assessedOnDate },
          OR: [{ endsOn: null }, { endsOn: { gte: assessedOnDate } }],
        },
        select: {
          startingPace: true,
          currentPace: true,
          targetPace: true,
        },
      });
      if (!enrollment) {
        throw new NotFoundException(
          "Active student subject placement not found",
        );
      }

      const policy = await tx.pacePolicy.findFirst({
        where: {
          tenantId: actor.tenantId,
          effectiveFrom: { lte: assessedAt },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: assessedAt } }],
        },
        orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
        select: {
          selfTestPassingScore: true,
          paceTestPassingScore: true,
          maxAssessmentsPerDay: true,
          allowSamePaceSameDay: true,
        },
      });
      if (!policy) throw new NotFoundException("Active PACE policy not found");

      const storedFacts = (await tx.paceAssessment.findMany({
        where: {
          tenantId: actor.tenantId,
          childId: command.childId,
          subjectId: command.subjectId,
        },
        orderBy: [{ assessedOn: "asc" }, { id: "asc" }],
        select: assessmentSelect,
      })) as AssessmentRecord[];
      const terminalFacts = terminalAssessmentRecords(storedFacts);
      if (!terminalFacts.some((fact) => fact.id === original.id)) {
        throw new ConflictException("PACE assessment is already superseded");
      }
      const remainingFacts = terminalFacts.filter(
        (fact) => fact.id !== original.id,
      );
      const remainingDomainFacts = toTerminalDomainFacts(remainingFacts);
      const assessmentType = toDatabaseAssessmentType(command.assessmentType);
      const passThreshold =
        command.assessmentType === "SelfTest"
          ? policy.selfTestPassingScore
          : policy.paceTestPassingScore;
      const currentProjection = rebuildPaceProgress({
        assignedLevel: parsePaceOrThrow(enrollment.startingPace).level,
        startingPace: enrollment.currentPace,
        assessmentFacts: remainingDomainFacts,
      });
      const dailyTestCount = await this.countDailyTerminalFacts(
        tx,
        actor.tenantId,
        command.childId,
        assessedOnDate,
        original.id,
      );
      const policyResult = evaluatePaceAssessment({
        assessmentType: command.assessmentType,
        score: command.score,
        passThreshold,
        assessedPace: parsePaceOrThrow(command.paceNumber),
        currentPace: currentProjection.currentPace,
        dailyTestCount,
        dailyTestLimitEnabled: true,
        dailyTestLimit: policy.maxAssessmentsPerDay,
        samePaceSameDayBlockEnabled: !policy.allowSamePaceSameDay,
        hasExistingSelfTest: remainingFacts.some(
          (fact) =>
            fact.assessmentType === "SELF_TEST" &&
            fact.paceNumber === command.paceNumber,
        ),
        hasRequiredSelfTest: remainingFacts.some(
          (fact) =>
            fact.assessmentType === "SELF_TEST" &&
            fact.paceNumber === command.paceNumber,
        ),
        hasOppositeTypeAssessmentOnSameDay: remainingFacts.some(
          (fact) =>
            fact.paceNumber === command.paceNumber &&
            formatDatabaseDate(fact.assessedOn) === assessedOn &&
            fact.assessmentType !== assessmentType,
        ),
        hasAuthorisedOverride: false,
      });
      if (policyResult.decision === "block") {
        throw policyBlocked(policyResult.code);
      }

      const correction = (await tx.paceAssessment.create({
        data: {
          tenantId: actor.tenantId,
          childId: command.childId,
          subjectId: command.subjectId,
          paceNumber: command.paceNumber,
          assessmentType,
          score: command.score,
          result: command.score >= passThreshold ? "PASSED" : "FAILED",
          assessedOn: assessedOnDate,
          recordedByUserId: actor.userId,
          reason: command.reason.trim(),
          correctsAssessmentId: original.id,
        },
        select: assessmentSelect,
      })) as AssessmentRecord;
      const rebuiltProgress = rebuildProgressRecord(
        enrollment,
        [...storedFacts, correction],
        policyResult,
        correction.createdAt,
      );
      const progress = (await tx.paceProgress.upsert({
        where: {
          tenantId_childId_subjectId: {
            tenantId: actor.tenantId,
            childId: command.childId,
            subjectId: command.subjectId,
          },
        },
        create: {
          tenantId: actor.tenantId,
          childId: command.childId,
          subjectId: command.subjectId,
          ...rebuiltProgress,
        },
        update: rebuiltProgress,
        select: progressSelect,
      })) as ProgressRecord;

      await recordAuditEventInTransaction(tx, {
        actorUserId: actor.userId,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        entityType: AuditEntityType.ACE_RECORD,
        entityId: correction.id,
        action: AuditAction.CREATED,
        metadata: {
          operation: "PACE_ASSESSMENT_CORRECTED",
          correctsAssessmentId: original.id,
          assessmentType: command.assessmentType,
          paceNumber: command.paceNumber,
          policyDecision: policyResult.decision,
          policyCode: policyResult.code,
          policyNextPace: policyResult.nextPace?.raw ?? null,
          progress: {
            ...progress,
            rebuiltAt: progress.rebuiltAt.toISOString(),
          },
        },
      });
      await this.outbox.enqueue(tx, {
        aggregateType: "PACE_ASSESSMENT",
        aggregateId: correction.id,
        eventType: "ace.pace.assessment-corrected",
        payload: {},
        idempotencyKey: `ace-pace-assessment-correction:${actor.tenantId}:${correction.id}`,
      });

      const response = toCommandResponse(
        correction,
        progress,
        policyResult,
        false,
      );
      return {
        ...response,
        assessment: {
          ...response.assessment,
          correctsAssessmentId: original.id,
        },
      };
    });
  }

  async override(
    command: PacePolicyOverrideDto,
    actor: PaceCommandActor,
  ): Promise<PacePolicyOverrideResponse> {
    this.assertActor(actor);
    this.assertOverrideCommand(command);
    const now = new Date();
    this.assertFreshStepUp(actor, now);
    const expiresAt = this.parseOverrideExpiry(command.expiresAt, now);

    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const site = await this.requireActiveSite(tx, actor);
      const today = toDatabaseDate(localDateAt(now, site.timezone));
      const clientCommandKeyHash = overrideClientCommandKeyHash(
        actor.tenantId,
        command.idempotencyKey,
      );
      const assessmentFingerprint = paceOverrideAssessmentFingerprint(
        actor.tenantId,
        command,
      );
      await this.acquireCommandLocks(
        tx,
        actor.tenantId,
        command.childId,
        command.idempotencyKey,
      );

      const existing = await tx.pacePolicyOverride.findFirst({
        where: { tenantId: actor.tenantId, clientCommandKeyHash },
        select: {
          id: true,
          childId: true,
          subjectId: true,
          pacePolicyId: true,
          policyCode: true,
          authorisedByUserId: true,
          reason: true,
          expiresAt: true,
          createdAt: true,
          assessmentFingerprint: true,
        },
      });
      if (existing) {
        if (
          existing.assessmentFingerprint !== assessmentFingerprint ||
          existing.policyCode !== command.policyCode ||
          existing.authorisedByUserId !== actor.userId ||
          existing.reason !== command.reason.trim() ||
          existing.expiresAt.getTime() !== expiresAt.getTime()
        ) {
          throw idempotencyConflict();
        }
        return this.toPolicyOverrideResponse(existing);
      }

      const enrollment = await tx.studentSubjectEnrollment.findFirst({
        where: {
          tenantId: actor.tenantId,
          childId: command.childId,
          subjectId: command.subjectId,
          status: "ACTIVE",
          startsOn: { lte: today },
          OR: [{ endsOn: null }, { endsOn: { gte: today } }],
        },
        select: { id: true },
      });
      if (!enrollment) {
        throw new NotFoundException(
          "Active student subject placement not found",
        );
      }
      const policy = await tx.pacePolicy.findFirst({
        where: {
          tenantId: actor.tenantId,
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
        orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
        select: { id: true },
      });
      if (!policy) throw new NotFoundException("Active PACE policy not found");

      const policyOverride = await tx.pacePolicyOverride.create({
        data: {
          tenantId: actor.tenantId,
          childId: command.childId,
          subjectId: command.subjectId,
          pacePolicyId: policy.id,
          policyCode: command.policyCode,
          clientCommandKeyHash,
          assessmentFingerprint,
          authorisedByUserId: actor.userId,
          reason: command.reason.trim(),
          expiresAt,
        },
        select: {
          id: true,
          childId: true,
          subjectId: true,
          pacePolicyId: true,
          policyCode: true,
          assessmentFingerprint: true,
          authorisedByUserId: true,
          expiresAt: true,
          createdAt: true,
        },
      });
      await recordAuditEventInTransaction(tx, {
        actorUserId: actor.userId,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        entityType: AuditEntityType.ACE_RECORD,
        entityId: policyOverride.id,
        action: AuditAction.CREATED,
        metadata: {
          operation: "PACE_POLICY_OVERRIDE_AUTHORISED",
          childId: policyOverride.childId,
          subjectId: policyOverride.subjectId,
          pacePolicyId: policyOverride.pacePolicyId,
          policyCode: policyOverride.policyCode,
          expiresAt: policyOverride.expiresAt.toISOString(),
        },
      });
      await this.outbox.enqueue(tx, {
        aggregateType: "PACE_POLICY_OVERRIDE",
        aggregateId: policyOverride.id,
        eventType: "ace.pace.policy-override-authorised",
        payload: {},
        idempotencyKey: `ace-pace-policy-override:${clientCommandKeyHash}:${assessmentFingerprint}`,
      });
      return this.toPolicyOverrideResponse(policyOverride);
    });
  }

  private async readRecordedResult(
    tx: PrismaTypes.TransactionClient,
    tenantId: string,
    assessmentId: string,
  ): Promise<PaceCommandResponse> {
    const [fact, audit] = await Promise.all([
      tx.paceAssessment.findFirst({
        where: { id: assessmentId, tenantId },
        select: assessmentSelect,
      }),
      tx.auditEvent.findFirst({
        where: {
          tenantId,
          entityType: AuditEntityType.ACE_RECORD,
          entityId: assessmentId,
          action: AuditAction.CREATED,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { metadata: true },
      }),
    ]);
    if (!fact || !audit) {
      throw new ConflictException("PACE command state is unavailable");
    }
    const recorded = parseRecordedPaceCommandResult(audit.metadata);
    return toCommandResponse(
      fact as AssessmentRecord,
      recorded.progress,
      recorded.policy,
      true,
    );
  }

  private async countDailyTerminalFacts(
    tx: PrismaTypes.TransactionClient,
    tenantId: string,
    childId: string,
    assessedOn: Date,
    excludedAssessmentId?: string,
  ): Promise<number> {
    const [row] = await tx.$queryRaw<Array<{ count: number }>>(
      Prisma.sql`
        SELECT COUNT(*)::integer AS "count"
        FROM "PaceAssessment" AS fact
        WHERE fact."tenantId" = ${tenantId}
          AND fact."childId" = ${childId}
          AND fact."assessedOn" = CAST(${assessedOn} AS date)
          AND (${excludedAssessmentId ?? null}::text IS NULL OR fact.id <> ${excludedAssessmentId ?? null})
          AND NOT EXISTS (
            SELECT 1
            FROM "PaceAssessment" AS correction
            WHERE correction."tenantId" = fact."tenantId"
              AND correction."childId" = fact."childId"
              AND correction."subjectId" = fact."subjectId"
              AND correction."correctsAssessmentId" = fact.id
          )
      `,
    );
    return row?.count ?? 0;
  }

  private async requireActiveSite(
    tx: PrismaTypes.TransactionClient,
    actor: PaceCommandActor,
  ): Promise<{ timezone: string }> {
    const site = await tx.tenant.findFirst({
      where: { id: actor.tenantId, orgId: actor.orgId },
      select: { timezone: true },
    });
    if (!site) throw new NotFoundException("Active site not found");
    if (!isIanaTimezone(site.timezone)) {
      throw new BadRequestException("The active site has an invalid timezone");
    }
    return { timezone: site.timezone };
  }

  private async acquireCommandLocks(
    tx: PrismaTypes.TransactionClient,
    tenantId: string,
    childId: string,
    clientKey: string,
  ): Promise<void> {
    const lockKeys = [
      `ace-pace-assessment:${tenantId}:${childId}`,
      clientCommandLockKey(tenantId, clientKey),
    ].sort();
    for (const lockKey of lockKeys) {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
      );
    }
  }

  private async acquireAggregateLock(
    tx: PrismaTypes.TransactionClient,
    tenantId: string,
    childId: string,
  ): Promise<void> {
    const lockKey = `ace-pace-assessment:${tenantId}:${childId}`;
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
    );
  }

  private assertActor(actor: PaceCommandActor): void {
    if (
      !actor.tenantId?.trim() ||
      !actor.orgId?.trim() ||
      !actor.userId?.trim()
    ) {
      throw new BadRequestException("A complete active-site actor is required");
    }
  }

  private assertCommand(command: CreatePaceAssessmentDto): void {
    if (
      !command.childId?.trim() ||
      !command.subjectId?.trim() ||
      !command.idempotencyKey?.trim() ||
      !command.reason?.trim() ||
      !Number.isInteger(command.score) ||
      command.score < 0 ||
      command.score > 100 ||
      Number.isNaN(new Date(command.assessedAt).getTime())
    ) {
      throw new BadRequestException("Invalid PACE assessment command");
    }
    parsePaceOrThrow(command.paceNumber);
  }

  private assertCorrection(
    assessmentId: string,
    command: PaceAssessmentCorrectionDto,
  ): void {
    if (
      !assessmentId?.trim() ||
      !command.childId?.trim() ||
      !command.subjectId?.trim() ||
      !command.reason?.trim() ||
      !Number.isInteger(command.score) ||
      command.score < 0 ||
      command.score > 100 ||
      Number.isNaN(new Date(command.assessedAt).getTime())
    ) {
      throw new BadRequestException("Invalid PACE correction command");
    }
    parsePaceOrThrow(command.paceNumber);
  }

  private assertOverrideCommand(command: PacePolicyOverrideDto): void {
    if (
      !command.idempotencyKey?.trim() ||
      !command.childId?.trim() ||
      !command.subjectId?.trim() ||
      !command.reason?.trim() ||
      !Number.isInteger(command.score) ||
      command.score < 0 ||
      command.score > 100 ||
      Number.isNaN(new Date(command.assessedAt).getTime())
    ) {
      throw new BadRequestException("Invalid PACE policy override command");
    }
    parsePaceOrThrow(command.paceNumber);
  }

  private toPolicyOverrideResponse(policyOverride: {
    id: string;
    childId: string;
    subjectId: string;
    pacePolicyId: string;
    policyCode: string;
    authorisedByUserId: string;
    expiresAt: Date;
    createdAt: Date;
  }): PacePolicyOverrideResponse {
    return {
      id: policyOverride.id,
      childId: policyOverride.childId,
      subjectId: policyOverride.subjectId,
      pacePolicyId: policyOverride.pacePolicyId,
      policyCode:
        policyOverride.policyCode as PacePolicyOverrideDto["policyCode"],
      authorisedByUserId: policyOverride.authorisedByUserId,
      expiresAt: policyOverride.expiresAt.toISOString(),
      createdAt: policyOverride.createdAt.toISOString(),
    };
  }

  private assertFreshStepUp(actor: PaceCommandActor, now: Date): void {
    const authenticatedAt = actor.stepUp
      ? new Date(actor.stepUp.authenticatedAt)
      : null;
    const age = authenticatedAt ? now.getTime() - authenticatedAt.getTime() : NaN;
    if (
      !actor.stepUp?.secondFactor ||
      !authenticatedAt ||
      Number.isNaN(age) ||
      age < 0 ||
      age > STEP_UP_MAX_AGE_MS
    ) {
      throw new ForbiddenException({
        statusCode: 403,
        code: "STEP_UP_REQUIRED",
        message: "Recent step-up authentication is required.",
      });
    }
  }

  private parseOverrideExpiry(value: string, now: Date): Date {
    const expiresAt = new Date(value);
    const ttl = expiresAt.getTime() - now.getTime();
    if (Number.isNaN(expiresAt.getTime()) || ttl <= 0 || ttl > OVERRIDE_MAX_TTL_MS) {
      throw new BadRequestException(
        "PACE policy override expiry must be within 15 minutes",
      );
    }
    return expiresAt;
  }
}
