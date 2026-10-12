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
import {
  behaviourBatchFactKeyHash,
  behaviourBatchFingerprint,
  behaviourClientLockKey,
  behaviourEntryCommandSelect,
  behaviourEntryReplayMetadataSelect,
  behaviourIdempotencyConflict,
  isBehaviourUniqueConstraintError,
  toBehaviourEntryResponse,
  type BehaviourEntryRecord,
  type BehaviourEntryReplayMetadata,
} from "./behaviour-entry.support";
import {
  BehaviourCommandService,
  type BehaviourActor,
} from "./behaviour-command.service";
import {
  createBehaviourBatchSchema,
  type CreateBehaviourBatchDto,
} from "./dto/behaviour-entry.dto";

interface BehaviourBatchResponse {
  entries: ReturnType<typeof toBehaviourEntryResponse>[];
  duplicate: boolean;
}

@Injectable()
export class BehaviourBatchService {
  constructor(
    @Inject(BehaviourCommandService)
    private readonly commandService: BehaviourCommandService,
    @Inject(EffectivePermissionsService)
    private readonly permissions: EffectivePermissionsService,
  ) {}

  async record(
    input: CreateBehaviourBatchDto,
    actor: BehaviourActor,
  ): Promise<BehaviourBatchResponse> {
    const parsed = createBehaviourBatchSchema.safeParse(input);
    if (!parsed.success || !actor.tenantId || !actor.orgId || !actor.userId) {
      throw new BadRequestException("Invalid behaviour batch");
    }
    const batch = parsed.data;
    const fingerprint = behaviourBatchFingerprint(actor.userId, batch);
    const factCount =
      batch.childIds.length *
      batch.entries.reduce((total, row) => total + row.quantity, 0);
    const keys = Array.from({ length: factCount }, (_, index) =>
      behaviourBatchFactKeyHash(actor.tenantId, batch.idempotencyKey, index),
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
            select: { timezone: true },
          });
          if (!site) throw new NotFoundException("Active site not found");

          await this.acquireLocks(tx, actor.tenantId, batch);
          const replay = (await tx.behaviourEntry.findFirst({
            where: { tenantId: actor.tenantId, clientCommandKeyHash: keys[0] },
            select: behaviourEntryReplayMetadataSelect,
          })) as BehaviourEntryReplayMetadata | null;
          if (replay) {
            if (replay.commandFingerprint !== fingerprint) {
              throw behaviourIdempotencyConflict();
            }
            const entries = (await tx.behaviourEntry.findMany({
              where: {
                tenantId: actor.tenantId,
                clientCommandKeyHash: { in: keys },
              },
              select: behaviourEntryCommandSelect,
            })) as BehaviourEntryRecord[];
            if (entries.length !== factCount) {
              throw new ConflictException(
                "Behaviour batch replay is incomplete",
              );
            }
            if (
              !sensitiveDecision.allowed &&
              entries.some((entry) => entry.visibility === "SENSITIVE")
            ) {
              throw new ForbiddenException(
                "Sensitive behaviour permission is required",
              );
            }
            const byKey = new Map(
              entries.map((entry) => [entry.clientCommandKeyHash, entry]),
            );
            return {
              entries: keys.map((key) => {
                const entry = byKey.get(key);
                if (!entry) {
                  throw new ConflictException(
                    "Behaviour batch replay is incomplete",
                  );
                }
                return toBehaviourEntryResponse(entry);
              }),
              duplicate: true,
            };
          }

          const children = await tx.child.findMany({
            where: { tenantId: actor.tenantId, id: { in: batch.childIds } },
            select: { id: true },
          });
          if (children.length !== batch.childIds.length) {
            throw new NotFoundException("Child not found");
          }

          const entries: BehaviourEntryRecord[] = [];
          for (const childId of batch.childIds) {
            for (const row of batch.entries) {
              for (let quantity = 0; quantity < row.quantity; quantity += 1) {
                const index = entries.length;
                entries.push(
                  await this.commandService.writeEntryInTransaction(tx, {
                    operation: "record",
                    command: {
                      idempotencyKey: batch.idempotencyKey,
                      childId,
                      occurredAt: batch.occurredAt,
                      category: row.category,
                      type: row.type,
                      visibility: row.visibility,
                      pointsDelta: row.pointsDelta,
                      reason: row.reason,
                      note: row.note,
                    },
                    actor,
                    predecessor: null,
                    timezone: site.timezone,
                    canReadSensitive: sensitiveDecision.allowed,
                    clientCommandKeyHash: behaviourBatchFactKeyHash(
                      actor.tenantId,
                      batch.idempotencyKey,
                      index,
                    ),
                    commandFingerprint: fingerprint,
                  }),
                );
              }
            }
          }
          return {
            entries: entries.map(toBehaviourEntryResponse),
            duplicate: false,
          };
        },
      );
    } catch (error) {
      if (isBehaviourUniqueConstraintError(error)) {
        throw new ConflictException(
          "Behaviour entry changed before this command completed",
        );
      }
      throw error;
    }
  }

  private async acquireLocks(
    tx: Prisma.TransactionClient,
    tenantId: string,
    batch: CreateBehaviourBatchDto,
  ): Promise<void> {
    const lockKeys = [
      behaviourClientLockKey(tenantId, batch.idempotencyKey),
      ...batch.childIds.map(
        (childId) => `ace-behaviour-entry:${tenantId}:${childId}`,
      ),
    ].sort();
    for (const key of lockKeys) {
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
      );
    }
  }
}
