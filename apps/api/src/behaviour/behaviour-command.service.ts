import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { acquireAceSettingsReadLock } from "../ace-settings/ace-settings-write-lock";
import { EffectivePermissionsService } from "../access-control/effective-permissions.service";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import { OutboxService } from "../common/outbox/outbox.service";
import {
  behaviourClientCommandKeyHash,
  behaviourClientLockKey,
  behaviourCommandFingerprint,
  behaviourEntryCommandSelect,
  behaviourIdempotencyConflict,
  toBehaviourEntryResponse,
  type BehaviourEntryCommand,
  type BehaviourEntryRecord,
} from "./behaviour-entry.support";
import type {
  BehaviourCorrectionDto,
  CreateBehaviourEntryDto,
} from "./dto/behaviour-entry.dto";

export interface BehaviourActor {
  tenantId: string;
  orgId: string;
  userId: string;
}

interface ActiveCategory {
  policyVersion: number;
  code: string;
  type: "MERIT" | "DEMERIT" | "GENERAL";
  visibility: "GENERAL" | "SENSITIVE";
  isActive: boolean;
  isSerious: boolean;
}

interface BehaviourPredecessor {
  id: string;
  type: "MERIT" | "DEMERIT" | "GENERAL";
  visibility: "GENERAL" | "SENSITIVE";
  pointsDelta: number;
}

@Injectable()
export class BehaviourCommandService {
  constructor(
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(EffectivePermissionsService)
    private readonly permissions: EffectivePermissionsService,
  ) {}

  async record(command: CreateBehaviourEntryDto, actor: BehaviourActor) {
    return this.execute("record", null, command, actor);
  }

  async correct(
    entryId: string,
    command: BehaviourCorrectionDto,
    actor: BehaviourActor,
  ) {
    if (!entryId?.trim()) {
      throw new BadRequestException("A behaviour entry is required");
    }
    return this.execute("correct", entryId, command, actor);
  }

  private async execute(
    operation: "record" | "correct",
    predecessorId: string | null,
    command: BehaviourEntryCommand,
    actor: BehaviourActor,
  ) {
    this.assertActor(actor);
    this.assertCommand(command);
    const canReadSensitive = await this.canReadSensitive(actor);
    const clientCommandKeyHash = behaviourClientCommandKeyHash(
      actor.tenantId,
      command.idempotencyKey,
    );
    const commandFingerprint = behaviourCommandFingerprint(
      operation,
      actor.userId,
      command,
      predecessorId,
    );

    try {
      return await withTenantRlsContext(
        actor.tenantId,
        actor.orgId,
        async (tx) => {
          await this.requireActiveSite(tx, actor);
          await this.requireChild(tx, actor.tenantId, command.childId);
          await this.acquireCommandLocks(
            tx,
            actor.tenantId,
            command.childId,
            command.idempotencyKey,
          );

          const replay = (await tx.behaviourEntry.findFirst({
            where: { tenantId: actor.tenantId, clientCommandKeyHash },
            select: behaviourEntryCommandSelect,
          })) as BehaviourEntryRecord | null;
          if (replay) {
            if (replay.commandFingerprint !== commandFingerprint) {
              throw behaviourIdempotencyConflict();
            }
            this.requireSensitivePermission(
              replay.visibility,
              canReadSensitive,
            );
            return {
              entry: toBehaviourEntryResponse(replay),
              duplicate: true,
            };
          }

          const predecessor = predecessorId
            ? await this.requireTerminalPredecessor(
                tx,
                predecessorId,
                actor.tenantId,
                command.childId,
              )
            : null;

          await acquireAceSettingsReadLock(tx, actor.tenantId);
          const category = await this.requireActiveCategory(
            tx,
            actor.tenantId,
            command.category,
          );
          this.assertCategoryMatchesCommand(category, command);
          this.requireSensitivePermission(
            category.visibility,
            canReadSensitive,
          );
          if (predecessor) {
            this.requireSensitivePermission(
              predecessor.visibility,
              canReadSensitive,
            );
          }

          const entry = (await tx.behaviourEntry.create({
            data: {
              tenantId: actor.tenantId,
              childId: command.childId,
              category: category.code,
              categoryPolicyVersion: category.policyVersion,
              categoryIsSerious: category.isSerious,
              type: category.type,
              visibility: category.visibility,
              pointsDelta: command.pointsDelta,
              occurredAt: new Date(command.occurredAt),
              recordedByUserId: actor.userId,
              reason: command.reason.trim(),
              note: command.note?.trim(),
              correctsBehaviourEntryId: predecessor?.id,
              clientCommandKeyHash,
              commandFingerprint,
            },
            select: behaviourEntryCommandSelect,
          })) as BehaviourEntryRecord;

          await recordAuditEventInTransaction(tx, {
            actorUserId: actor.userId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            entityType: AuditEntityType.ACE_RECORD,
            entityId: entry.id,
            action: AuditAction.CREATED,
            metadata: {
              operation:
                operation === "correct"
                  ? "BEHAVIOUR_ENTRY_CORRECTED"
                  : "BEHAVIOUR_ENTRY_RECORDED",
              childId: entry.childId,
              categoryPolicyVersion: entry.categoryPolicyVersion,
              categoryIsSerious: entry.categoryIsSerious,
              type: entry.type,
              visibility: entry.visibility,
              pointsDelta: entry.pointsDelta,
              correctsBehaviourEntryId: entry.correctsBehaviourEntryId,
            },
          });

          const meritPointsDelta = this.meritPointsAdjustment(
            entry,
            predecessor,
          );
          if (entry.type === "MERIT" || predecessor?.type === "MERIT") {
            await this.outbox.enqueue(tx, {
              aggregateType: "BEHAVIOUR_ENTRY",
              aggregateId: entry.id,
              eventType: "behaviour.merit-awarded",
              payload: {
                behaviourEntryId: entry.id,
                childId: entry.childId,
                pointsDelta: meritPointsDelta,
                correctsBehaviourEntryId: entry.correctsBehaviourEntryId,
              },
              idempotencyKey: `behaviour-merit-awarded:${entry.id}`,
            });
          }

          return {
            entry: toBehaviourEntryResponse(entry),
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

  private async canReadSensitive(actor: BehaviourActor): Promise<boolean> {
    const decision = await this.permissions.resolve({
      ...actor,
      permission: "ace.behaviour.sensitive.read",
      now: new Date(),
    });
    return decision.allowed;
  }

  private async requireActiveSite(
    tx: Prisma.TransactionClient,
    actor: BehaviourActor,
  ): Promise<void> {
    const site = await tx.tenant.findFirst({
      where: { id: actor.tenantId, orgId: actor.orgId },
      select: { id: true },
    });
    if (!site) throw new NotFoundException("Active site not found");
  }

  private async requireChild(
    tx: Prisma.TransactionClient,
    tenantId: string,
    childId: string,
  ): Promise<void> {
    const child = await tx.child.findFirst({
      where: { id: childId, tenantId },
      select: { id: true },
    });
    if (!child) throw new NotFoundException("Child not found");
  }

  private async requireActiveCategory(
    tx: Prisma.TransactionClient,
    tenantId: string,
    code: string,
  ): Promise<ActiveCategory> {
    const aggregate = await tx.behaviourCategory.aggregate({
      where: { tenantId },
      _max: { policyVersion: true },
    });
    const policyVersion = aggregate._max.policyVersion;
    if (!policyVersion) {
      throw new NotFoundException("Active behaviour policy not found");
    }
    const category = await tx.behaviourCategory.findFirst({
      where: { tenantId, policyVersion, code },
      select: behaviourCategorySelect,
    });
    if (!category) throw new NotFoundException("Behaviour category not found");
    if (!category.isActive) {
      throw new BadRequestException("Behaviour category is inactive");
    }
    return category;
  }

  private async requireTerminalPredecessor(
    tx: Prisma.TransactionClient,
    entryId: string,
    tenantId: string,
    childId: string,
  ): Promise<BehaviourPredecessor> {
    const predecessor = await tx.behaviourEntry.findFirst({
      where: { id: entryId, tenantId, childId },
      select: {
        id: true,
        type: true,
        visibility: true,
        pointsDelta: true,
        correction: { select: { id: true } },
      },
    });
    if (!predecessor) throw new NotFoundException("Behaviour entry not found");
    if (predecessor.correction) {
      throw new ConflictException("Behaviour entry is already superseded");
    }
    return {
      id: predecessor.id,
      type: predecessor.type,
      visibility: predecessor.visibility,
      pointsDelta: predecessor.pointsDelta,
    };
  }

  private requireSensitivePermission(
    visibility: BehaviourPredecessor["visibility"],
    canReadSensitive: boolean,
  ): void {
    if (visibility === "SENSITIVE" && !canReadSensitive) {
      throw new ForbiddenException(
        "Sensitive behaviour permission is required",
      );
    }
  }

  private meritPointsAdjustment(
    entry: Pick<BehaviourEntryRecord, "type" | "pointsDelta">,
    predecessor: BehaviourPredecessor | null,
  ): number {
    const awardedPoints = entry.type === "MERIT" ? entry.pointsDelta : 0;
    const supersededPoints =
      predecessor?.type === "MERIT" ? predecessor.pointsDelta : 0;
    return awardedPoints - supersededPoints;
  }

  private async acquireCommandLocks(
    tx: Prisma.TransactionClient,
    tenantId: string,
    childId: string,
    clientKey: string,
  ): Promise<void> {
    const lockKeys = [
      `ace-behaviour-entry:${tenantId}:${childId}`,
      behaviourClientLockKey(tenantId, clientKey),
    ].sort();
    for (const lockKey of lockKeys) {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
      );
    }
  }

  private assertCategoryMatchesCommand(
    category: ActiveCategory,
    command: BehaviourEntryCommand,
  ): void {
    if (category.type !== command.type) {
      throw new BadRequestException("Behaviour type does not match category");
    }
    if (category.visibility !== command.visibility) {
      throw new BadRequestException(
        "Behaviour visibility does not match category",
      );
    }
    if (category.isSerious && category.type !== "DEMERIT") {
      throw new BadRequestException("Only Demerit categories can be serious");
    }
  }

  private assertActor(actor: BehaviourActor): void {
    if (
      !actor.tenantId?.trim() ||
      !actor.orgId?.trim() ||
      !actor.userId?.trim()
    ) {
      throw new BadRequestException("A complete active-site actor is required");
    }
  }

  private assertCommand(command: BehaviourEntryCommand): void {
    const occurredAt = new Date(command.occurredAt);
    const validDelta =
      (command.type === "MERIT" && command.pointsDelta > 0) ||
      (command.type === "DEMERIT" && command.pointsDelta < 0) ||
      (command.type === "GENERAL" && command.pointsDelta === 0);
    if (
      !command.idempotencyKey?.trim() ||
      !command.childId?.trim() ||
      !command.category?.trim() ||
      !command.reason?.trim() ||
      !Number.isInteger(command.pointsDelta) ||
      Math.abs(command.pointsDelta) > 10_000 ||
      !validDelta ||
      Number.isNaN(occurredAt.getTime())
    ) {
      throw new BadRequestException("Invalid behaviour command");
    }
  }
}

const behaviourCategorySelect = {
  policyVersion: true,
  code: true,
  type: true,
  visibility: true,
  isActive: true,
  isSerious: true,
} satisfies Prisma.BehaviourCategorySelect;

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
