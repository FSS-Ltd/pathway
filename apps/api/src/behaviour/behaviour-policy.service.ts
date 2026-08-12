import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { OutboxService } from "../common/outbox/outbox.service";
import { acquireAceSettingsWriteLock } from "../ace-settings/ace-settings-write-lock";
import {
  updateBehaviourPolicySchema,
  type BehaviourCategoryDto,
  type UpdateBehaviourPolicyDto,
} from "./dto/behaviour-policy.dto";

interface BehaviourPolicyActor {
  tenantId: string;
  orgId: string;
  userId: string;
}

interface DemeritPolicy {
  id: string;
  version: number;
  windowDays: number;
  stageOneThreshold: number;
  stageTwoThreshold: number;
  stageThreeThreshold: number;
  seriousMisconductStage: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

export interface BehaviourPolicyResponse {
  categoryVersion: number;
  categories: BehaviourCategoryDto[];
  demeritPolicy: DemeritPolicy | null;
}

@Injectable()
export class BehaviourPolicyService {
  constructor(
    @Inject(OutboxService)
    private readonly outbox: OutboxService = new OutboxService(),
  ) {}

  async get(actor: BehaviourPolicyActor): Promise<BehaviourPolicyResponse> {
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await this.requireSite(tx, actor);
      return this.loadCurrentPolicy(tx, actor.tenantId);
    });
  }

  async update(
    input: UpdateBehaviourPolicyDto,
    actor: BehaviourPolicyActor,
  ): Promise<BehaviourPolicyResponse> {
    const parsed = updateBehaviourPolicySchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const command = parsed.data;

    try {
      return await withTenantRlsContext(
        actor.tenantId,
        actor.orgId,
        async (tx) => {
          await acquireAceSettingsWriteLock(tx, actor.tenantId);
          await this.requireSite(tx, actor);
          const current = await this.loadCurrentPolicy(tx, actor.tenantId);

          this.assertExpectedVersion(
            command.expectedCategoryVersion,
            current.categoryVersion,
            "Behaviour categories",
          );
          this.assertExpectedVersion(
            command.expectedDemeritPolicyVersion,
            current.demeritPolicy?.version ?? 0,
            "Demerit policy",
          );

          const categoryVersion = current.categoryVersion + 1;
          await tx.behaviourCategory.createMany({
            data: command.categories.map((category) => ({
              ...category,
              tenantId: actor.tenantId,
              policyVersion: categoryVersion,
              createdByUserId: actor.userId,
              reason: command.reason,
            })),
          });
          const demeritPolicy = await this.appendDemeritPolicy(
            tx,
            command,
            actor,
          );
          const eventMetadata = {
            categoryCount: command.categories.length,
            categoryVersion,
            demeritPolicyVersion: demeritPolicy.version,
          };

          await recordAuditEventInTransaction(tx, {
            actorUserId: actor.userId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            entityType: AuditEntityType.ACE_RECORD,
            entityId: actor.tenantId,
            action: AuditAction.UPDATED,
            metadata: eventMetadata,
          });
          await this.outbox.enqueue(tx, {
            aggregateType: "ACE_BEHAVIOUR_POLICY",
            aggregateId: actor.tenantId,
            eventType: "ace.behaviour.policy.updated",
            payload: eventMetadata,
            idempotencyKey: `ace-behaviour-policy:${actor.tenantId}:${randomUUID()}`,
          });

          return {
            categoryVersion,
            categories: command.categories,
            demeritPolicy,
          };
        },
      );
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(
          "Behaviour policy changed before this update completed",
        );
      }
      throw error;
    }
  }

  private async loadCurrentPolicy(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<BehaviourPolicyResponse> {
    const [categoryAggregate, demeritPolicy] = await Promise.all([
      tx.behaviourCategory.aggregate({
        where: { tenantId },
        _max: { policyVersion: true },
      }),
      this.findCurrentDemeritPolicy(tx, tenantId),
    ]);
    const categoryVersion = categoryAggregate._max.policyVersion ?? 0;
    const categories = categoryVersion
      ? await tx.behaviourCategory.findMany({
          where: { tenantId, policyVersion: categoryVersion },
          orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
          select: behaviourCategorySelect,
        })
      : [];

    return { categoryVersion, categories, demeritPolicy };
  }

  private findCurrentDemeritPolicy(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<DemeritPolicy | null> {
    const now = new Date();
    return tx.demeritPolicy.findFirst({
      where: {
        tenantId,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
      orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
      select: demeritPolicySelect,
    });
  }

  private async appendDemeritPolicy(
    tx: Prisma.TransactionClient,
    command: UpdateBehaviourPolicyDto,
    actor: BehaviourPolicyActor,
  ): Promise<DemeritPolicy> {
    const latest = await tx.demeritPolicy.aggregate({
      where: { tenantId: actor.tenantId },
      _max: { version: true },
    });
    return tx.demeritPolicy.create({
      data: {
        tenantId: actor.tenantId,
        version: (latest._max.version ?? 0) + 1,
        ...command.demeritPolicy,
        effectiveFrom: new Date(),
        effectiveTo: null,
        createdByUserId: actor.userId,
        reason: command.reason,
      },
      select: demeritPolicySelect,
    });
  }

  private async requireSite(
    tx: Prisma.TransactionClient,
    actor: BehaviourPolicyActor,
  ): Promise<void> {
    const site = await tx.tenant.findFirst({
      where: { id: actor.tenantId, orgId: actor.orgId },
      select: { id: true },
    });
    if (!site) {
      throw new NotFoundException("Active site not found");
    }
  }

  private assertExpectedVersion(
    expected: number,
    actual: number,
    label: string,
  ): void {
    if (expected !== actual) {
      throw new ConflictException(`${label} changed before this update`);
    }
  }
}

const behaviourCategorySelect = {
  code: true,
  label: true,
  type: true,
  visibility: true,
  isActive: true,
  isSerious: true,
  sortOrder: true,
} satisfies Prisma.BehaviourCategorySelect;

const demeritPolicySelect = {
  id: true,
  version: true,
  windowDays: true,
  stageOneThreshold: true,
  stageTwoThreshold: true,
  stageThreeThreshold: true,
  seriousMisconductStage: true,
  effectiveFrom: true,
  effectiveTo: true,
} satisfies Prisma.DemeritPolicySelect;

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
