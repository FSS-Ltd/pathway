import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { evaluatePaceAssessment, rebuildPaceProgress } from "@pathway/ace-domain";
import { Prisma, withTenantRlsContext, type Prisma as PrismaTypes } from "@pathway/db";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { OutboxService } from "../common/outbox/outbox.service";
import type { CreatePaceAssessmentDto } from "./dto/create-pace-assessment.dto";
import {
  assessmentSelect,
  completedPaceCount,
  formatDatabaseDate,
  isIanaTimezone,
  localDateAt,
  parsePaceOrThrow,
  policyBlocked,
  progressSelect,
  terminalAssessmentFacts,
  toCommandResponse,
  toDatabaseAssessmentType,
  toDatabaseDate,
  toDomainFact,
  toTrackStatus,
  type AssessmentRecord,
  type DatabaseAssessmentResult,
  type PaceCommandResponse,
  type ProgressRecord,
} from "./pace-command.support";

const ASSESSMENT_LOCK_PREFIX = "ace-pace-assessment";

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
    const outboxIdempotencyKey = this.outboxIdempotencyKey(
      actor.tenantId,
      command.idempotencyKey,
    );

    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await this.acquireCommandLock(tx, outboxIdempotencyKey);
      const existingIntent = await tx.outboxEvent.findFirst({
        where: { idempotencyKey: outboxIdempotencyKey },
        select: { aggregateId: true },
      });
      if (existingIntent) {
        return this.readDuplicateResult(
          tx,
          actor.tenantId,
          existingIntent.aggregateId,
        );
      }

      const site = await this.requireActiveSite(tx, actor);
      const assessedOn = localDateAt(assessedAt, site.timezone);
      const assessedOnDate = toDatabaseDate(assessedOn);
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
        throw new NotFoundException("Active student subject placement not found");
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
      const duplicate = storedFacts.find(
        (fact) =>
          fact.paceNumber === command.paceNumber &&
          fact.assessmentType === assessmentType &&
          formatDatabaseDate(fact.assessedOn) === assessedOn,
      );
      if (duplicate) {
        const progress = await this.requireProgress(
          tx,
          actor.tenantId,
          duplicate.childId,
          duplicate.subjectId,
        );
        return toCommandResponse(duplicate, progress, undefined, true);
      }

      const domainFacts = storedFacts.map(toDomainFact);
      const terminalFacts = terminalAssessmentFacts(domainFacts);
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
        assessmentFacts: domainFacts,
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
      if (policyResult.decision === "block") throw policyBlocked(policyResult.code);

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
      const allFacts = [...domainFacts, toDomainFact(fact)];
      const rebuilt = rebuildPaceProgress({
        assignedLevel: parsePaceOrThrow(enrollment.startingPace).level,
        startingPace: enrollment.currentPace,
        assessmentFacts: allFacts,
      });
      const terminalWithFact = terminalAssessmentFacts(allFacts);
      const latestFact = terminalWithFact.at(-1);
      const trackStatus = toTrackStatus(
        rebuilt.currentPace.raw,
        enrollment.targetPace,
      );
      const rebuiltAt = new Date();
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
          currentPace: rebuilt.currentPace.raw,
          targetPace: enrollment.targetPace,
          completedPaces: completedPaceCount(terminalWithFact),
          trackStatus,
          blockCode: policyResult.decision === "warn" ? policyResult.code : null,
          lastAssessmentId: latestFact?.id ?? null,
          rebuiltAt,
        },
        update: {
          currentPace: rebuilt.currentPace.raw,
          targetPace: enrollment.targetPace,
          completedPaces: completedPaceCount(terminalWithFact),
          trackStatus,
          blockCode: policyResult.decision === "warn" ? policyResult.code : null,
          lastAssessmentId: latestFact?.id ?? null,
          rebuiltAt,
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
          policyCode: policyResult.code,
          reason: command.reason.trim(),
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

  private async readDuplicateResult(
    tx: PrismaTypes.TransactionClient,
    tenantId: string,
    assessmentId: string,
  ): Promise<PaceCommandResponse> {
    const fact = (await tx.paceAssessment.findFirst({
      where: { id: assessmentId, tenantId },
      select: assessmentSelect,
    })) as AssessmentRecord | null;
    if (!fact) throw new ConflictException("PACE command state is unavailable");
    const progress = await this.requireProgress(
      tx,
      tenantId,
      fact.childId,
      fact.subjectId,
    );
    return toCommandResponse(fact, progress, undefined, true);
  }

  private async requireProgress(
    tx: PrismaTypes.TransactionClient,
    tenantId: string,
    childId: string,
    subjectId: string,
  ): Promise<ProgressRecord> {
    const progress = (await tx.paceProgress.findUnique({
      where: {
        tenantId_childId_subjectId: { tenantId, childId, subjectId },
      },
      select: progressSelect,
    })) as ProgressRecord | null;
    if (!progress) throw new ConflictException("PACE command state is unavailable");
    return progress;
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
          AND fact."assessedOn" = ${assessedOn}
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

  private acquireCommandLock(
    tx: PrismaTypes.TransactionClient,
    idempotencyKey: string,
  ): Promise<unknown> {
    return tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${ASSESSMENT_LOCK_PREFIX}:${idempotencyKey}`}, 0))`,
    );
  }

  private outboxIdempotencyKey(tenantId: string, clientKey: string): string {
    return `ace-pace-assessment:${tenantId}:${clientKey}`;
  }

  private assertActor(actor: PaceCommandActor): void {
    if (!actor.tenantId?.trim() || !actor.orgId?.trim() || !actor.userId?.trim()) {
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
