import { createHash } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { EffectivePermissionsService } from "../access-control/effective-permissions.service";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import { OutboxService } from "../common/outbox/outbox.service";
import type { BehaviourActor } from "./behaviour-command.service";
import {
  behaviourClientLockKey,
  behaviourIdempotencyConflict,
} from "./behaviour-entry.support";
import { currentReviewerKinds } from "./behaviour-review-access";
import type { BehaviourRetractionDto } from "./dto/behaviour-entry.dto";

@Injectable()
export class BehaviourRetractionService {
  constructor(
    @Inject(EffectivePermissionsService)
    private readonly permissions: EffectivePermissionsService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async retract(
    entryId: string,
    command: BehaviourRetractionDto,
    actor: BehaviourActor,
  ) {
    if (!entryId?.trim())
      throw new BadRequestException("A behaviour entry is required");
    const keyHash = hash(
      `ace-behaviour-retraction:${actor.tenantId}:${command.idempotencyKey}`,
    );
    const fingerprint = hash(
      JSON.stringify({
        actorUserId: actor.userId,
        entryId,
        reason: command.reason.trim(),
      }),
    );
    const sensitiveDecision = await this.permissions.resolve({
      ...actor,
      permission: "ace.behaviour.sensitive.read",
      now: new Date(),
    });

    try {
      return await withTenantRlsContext(
        actor.tenantId,
        actor.orgId,
        async (tx) => {
          const site = await tx.tenant.findFirst({
            where: { id: actor.tenantId, orgId: actor.orgId },
            select: { id: true },
          });
          if (!site) throw new NotFoundException("Active site not found");
          const kinds = await currentReviewerKinds(tx, actor, new Date());
          if (kinds.length === 0) {
            throw new ForbiddenException(
              "Only Heads and Site Leads can void behaviour records",
            );
          }
          const target = await tx.behaviourEntry.findFirst({
            where: { id: entryId, tenantId: actor.tenantId },
            select: { id: true, childId: true },
          });
          if (!target) throw new NotFoundException("Behaviour entry not found");

          for (const lockKey of [
            `ace-behaviour-entry:${actor.tenantId}:${target.childId}`,
            behaviourClientLockKey(actor.tenantId, command.idempotencyKey),
          ].sort()) {
            await tx.$executeRaw(Prisma.sql`
            SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
          `);
          }

          const replay = await tx.behaviourEntryRetraction.findFirst({
            where: { tenantId: actor.tenantId, clientCommandKeyHash: keyHash },
            select: {
              id: true,
              entryId: true,
              retractedAt: true,
              commandFingerprint: true,
              entry: { select: { visibility: true } },
            },
          });
          if (replay) {
            if (replay.commandFingerprint !== fingerprint)
              throw behaviourIdempotencyConflict();
            this.requireSensitive(
              replay.entry.visibility,
              sensitiveDecision.allowed,
            );
            return {
              id: replay.id,
              entryId: replay.entryId,
              retractedAt: replay.retractedAt.toISOString(),
              duplicate: true,
            };
          }

          const entry = await tx.behaviourEntry.findFirst({
            where: {
              id: entryId,
              tenantId: actor.tenantId,
              childId: target.childId,
            },
            select: {
              id: true,
              childId: true,
              type: true,
              visibility: true,
              pointsDelta: true,
              correction: { select: { id: true } },
              retraction: { select: { id: true } },
            },
          });
          if (!entry) throw new NotFoundException("Behaviour entry not found");
          this.requireSensitive(entry.visibility, sensitiveDecision.allowed);
          if (entry.correction)
            throw new ConflictException(
              "Behaviour entry is already superseded",
            );
          if (entry.retraction)
            throw new ConflictException("Behaviour entry is already retracted");

          const retraction = await tx.behaviourEntryRetraction.create({
            data: {
              tenantId: actor.tenantId,
              childId: entry.childId,
              entryId: entry.id,
              reason: command.reason.trim(),
              retractedByUserId: actor.userId,
              clientCommandKeyHash: keyHash,
              commandFingerprint: fingerprint,
            },
            select: { id: true, retractedAt: true },
          });
          await recordAuditEventInTransaction(tx, {
            actorUserId: actor.userId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            entityType: AuditEntityType.ACE_RECORD,
            entityId: entry.id,
            action: AuditAction.UPDATED,
            metadata: {
              operation: "BEHAVIOUR_ENTRY_RETRACTED",
              retractionId: retraction.id,
              childId: entry.childId,
            },
          });
          if (entry.type === "MERIT") {
            await this.outbox.enqueue(tx, {
              aggregateType: "BEHAVIOUR_ENTRY",
              aggregateId: retraction.id,
              eventType: "behaviour.merit-awarded",
              payload: {
                behaviourEntryId: entry.id,
                childId: entry.childId,
                tenantId: actor.tenantId,
                orgId: actor.orgId,
                pointsDelta: -entry.pointsDelta,
                correctsBehaviourEntryId: null,
                retractionId: retraction.id,
              },
              idempotencyKey: `behaviour-merit-retracted:${retraction.id}`,
            });
          }
          return {
            id: retraction.id,
            entryId: entry.id,
            retractedAt: retraction.retractedAt.toISOString(),
            duplicate: false,
          };
        },
      );
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          "Behaviour entry changed before this command completed",
        );
      }
      throw error;
    }
  }

  private requireSensitive(
    visibility: "GENERAL" | "SENSITIVE",
    allowed: boolean,
  ): void {
    if (visibility === "SENSITIVE" && !allowed) {
      throw new ForbiddenException(
        "Sensitive behaviour permission is required",
      );
    }
  }
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
