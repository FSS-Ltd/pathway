import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import { OutboxService } from "../common/outbox/outbox.service";
import type {
  RecordPaceDiagnosticDto,
  RetractPaceDiagnosticDto,
} from "./dto/pace-diagnostic-command.dto";
import type { PaceQueryActor } from "./pace-query.service";

@Injectable()
export class PaceDiagnosticCommandService {
  constructor(
    @Inject(OutboxService)
    private readonly outbox: OutboxService,
  ) {}

  async record(actor: PaceQueryActor, command: RecordPaceDiagnosticDto) {
    assertActor(actor);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireSite(tx, actor);
      const enrollment = await tx.studentSubjectEnrollment.findFirst({
        where: {
          tenantId: actor.tenantId,
          childId: command.childId,
          subjectId: command.subjectId,
          status: "ACTIVE",
          child: { isGuest: false },
          subject: { isActive: true },
        },
        select: { id: true },
      });
      if (!enrollment) {
        throw new NotFoundException("Active subject enrollment not found");
      }

      const result = await tx.paceDiagnosticResult.create({
        data: {
          tenantId: actor.tenantId,
          childId: command.childId,
          subjectId: command.subjectId,
          enrollmentId: enrollment.id,
          level: command.level,
          outcome: command.outcome,
          recordedByUserId: actor.userId,
        },
        select: { id: true, recordedAt: true },
      });
      await recordAuditEventInTransaction(tx, {
        actorUserId: actor.userId,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        entityType: AuditEntityType.ACE_RECORD,
        entityId: result.id,
        action: AuditAction.CREATED,
        metadata: { event: "pace_diagnostic_recorded", ...command },
      });
      await this.outbox.enqueue(tx, {
        aggregateType: "pace_diagnostic",
        aggregateId: result.id,
        eventType: "ace.pace.diagnostic.recorded",
        payload: {
          tenantId: actor.tenantId,
          resultId: result.id,
          childId: command.childId,
          subjectId: command.subjectId,
        },
        idempotencyKey: `ace-pace-diagnostic:${result.id}:recorded`,
      });
      return { id: result.id, recordedAt: result.recordedAt.toISOString() };
    });
  }

  async retract(
    actor: PaceQueryActor,
    resultId: string,
    command: RetractPaceDiagnosticDto,
  ) {
    assertActor(actor);
    try {
      return await withTenantRlsContext(
        actor.tenantId,
        actor.orgId,
        async (tx) => {
          await requireSite(tx, actor);
          const result = await tx.paceDiagnosticResult.findFirst({
            where: { id: resultId, tenantId: actor.tenantId },
            select: { id: true, retraction: { select: { id: true } } },
          });
          if (!result)
            throw new NotFoundException("Diagnostic result not found");
          if (result.retraction) {
            throw new ConflictException("Diagnostic result already retracted");
          }

          const retraction = await tx.paceDiagnosticRetraction.create({
            data: {
              tenantId: actor.tenantId,
              resultId: result.id,
              reason: command.reason,
              retractedByUserId: actor.userId,
            },
            select: { id: true, retractedAt: true },
          });
          await recordAuditEventInTransaction(tx, {
            actorUserId: actor.userId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            entityType: AuditEntityType.ACE_RECORD,
            entityId: result.id,
            action: AuditAction.UPDATED,
            metadata: {
              event: "pace_diagnostic_retracted",
              retractionId: retraction.id,
              reason: command.reason,
            },
          });
          await this.outbox.enqueue(tx, {
            aggregateType: "pace_diagnostic",
            aggregateId: result.id,
            eventType: "ace.pace.diagnostic.retracted",
            payload: {
              tenantId: actor.tenantId,
              resultId: result.id,
              retractionId: retraction.id,
            },
            idempotencyKey: `ace-pace-diagnostic:${result.id}:retracted`,
          });
          return {
            id: retraction.id,
            resultId: result.id,
            retractedAt: retraction.retractedAt.toISOString(),
          };
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("Diagnostic result already retracted");
      }
      throw error;
    }
  }
}

type DiagnosticTx = Parameters<Parameters<typeof withTenantRlsContext>[2]>[0];

function assertActor(actor: PaceQueryActor): void {
  if (
    !actor.tenantId?.trim() ||
    !actor.orgId?.trim() ||
    !actor.userId?.trim()
  ) {
    throw new BadRequestException("A complete active-site actor is required");
  }
}

async function requireSite(
  tx: DiagnosticTx,
  actor: PaceQueryActor,
): Promise<void> {
  const site = await tx.tenant.findFirst({
    where: { id: actor.tenantId, orgId: actor.orgId },
    select: { id: true },
  });
  if (!site) throw new NotFoundException("Active site not found");
}
