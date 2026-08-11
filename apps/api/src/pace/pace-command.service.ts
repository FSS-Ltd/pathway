import {
  BadRequestException,
  ConflictException,
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
  parsePaceOrThrow,
  policyBlocked,
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
}

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
          duplicate.recordedByUserId !== actor.userId
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
      const policyResult = evaluatePaceAssessment({
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
        hasAuthorisedOverride: false,
      });
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
  ): Promise<number> {
    const [row] = await tx.$queryRaw<Array<{ count: number }>>(
      Prisma.sql`
        SELECT COUNT(*)::integer AS "count"
        FROM "PaceAssessment" AS fact
        WHERE fact."tenantId" = ${tenantId}
          AND fact."childId" = ${childId}
          AND fact."assessedOn" = CAST(${assessedOn} AS date)
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
}
