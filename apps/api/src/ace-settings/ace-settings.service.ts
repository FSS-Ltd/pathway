import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { OutboxService } from "../common/outbox/outbox.service";
import type { UpdateAceSettingsDto } from "./dto/ace-settings.dto";

interface AceSettingsActor {
  tenantId: string;
  orgId: string;
  userId: string;
}

type PacePolicy = {
  id: string;
  version: number;
  selfTestPassingScore: number;
  paceTestPassingScore: number;
  maxAssessmentsPerDay: number;
  allowSamePaceSameDay: boolean;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

type DemeritPolicy = {
  id: string;
  version: number;
  windowDays: number;
  stageOneThreshold: number;
  stageTwoThreshold: number;
  stageThreeThreshold: number;
  seriousMisconductStage: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
};

type CommunityFeature = {
  enabled: boolean;
  updatedAt: string | null;
};

const SETTINGS_WRITE_LOCK_PREFIX = "ace-settings";

export interface AceSettingsResponse {
  timezone: string;
  pacePolicy: PacePolicy | null;
  demeritPolicy: DemeritPolicy | null;
  features: { "ace.student_community": CommunityFeature };
}

@Injectable()
export class AceSettingsService {
  constructor(private readonly outbox = new OutboxService()) {}

  async get(actor: AceSettingsActor): Promise<AceSettingsResponse> {
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const site = await this.requireSite(tx, actor);
      const [pacePolicy, demeritPolicy, communityPolicy] = await Promise.all([
        this.findCurrentPacePolicy(tx, actor.tenantId),
        this.findCurrentDemeritPolicy(tx, actor.tenantId),
        tx.aceCommunityPolicy.findUnique({
          where: { tenantId: actor.tenantId },
          select: { communityEnabled: true, updatedAt: true },
        }),
      ]);

      return this.toResponse(site.timezone, pacePolicy, demeritPolicy, communityPolicy);
    });
  }

  async update(
    command: UpdateAceSettingsDto,
    actor: AceSettingsActor,
  ): Promise<AceSettingsResponse> {
    this.assertCommand(command);

    try {
      return await withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
        await this.acquireSettingsWriteLock(tx, actor.tenantId);
        const site = await this.requireSite(tx, actor);
        const [currentPacePolicy, currentDemeritPolicy, communityPolicy] =
          await Promise.all([
            this.findCurrentPacePolicy(tx, actor.tenantId),
            this.findCurrentDemeritPolicy(tx, actor.tenantId),
            tx.aceCommunityPolicy.findUnique({
              where: { tenantId: actor.tenantId },
              select: { communityEnabled: true, updatedAt: true },
            }),
          ]);

        this.assertExpectedVersion(
          command.expectedPacePolicyVersion,
          currentPacePolicy?.version ?? 0,
          "PACE policy",
        );
        this.assertExpectedVersion(
          command.expectedDemeritPolicyVersion,
          currentDemeritPolicy?.version ?? 0,
          "demerit policy",
        );

        let pacePolicy = currentPacePolicy;
        let demeritPolicy = currentDemeritPolicy;
        let feature: CommunityFeature = this.toCommunityFeature(communityPolicy);
        const changedSections: string[] = [];

        if (command.pacePolicy) {
          pacePolicy = await this.appendPacePolicy(
            tx,
            actor,
            command.reason,
            command.pacePolicy,
          );
          changedSections.push("pacePolicy");
        }

        if (command.demeritPolicy) {
          demeritPolicy = await this.appendDemeritPolicy(
            tx,
            actor,
            command.reason,
            command.demeritPolicy,
          );
          changedSections.push("demeritPolicy");
        }

        const communityChange = command.features?.["ace.student_community"];
        if (communityChange) {
          feature = await this.updateCommunityFeature(
            tx,
            actor.tenantId,
            communityPolicy,
            communityChange,
          );
          changedSections.push("ace.student_community");
        }

        await recordAuditEventInTransaction(tx, {
          actorUserId: actor.userId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          entityType: AuditEntityType.ACE_RECORD,
          entityId: actor.tenantId,
          action: AuditAction.UPDATED,
          metadata: {
            changedSections,
            pacePolicyVersion: pacePolicy?.version ?? null,
            demeritPolicyVersion: demeritPolicy?.version ?? null,
          },
        });
        await this.outbox.enqueue(tx, {
          aggregateType: "ACE_SETTINGS",
          aggregateId: actor.tenantId,
          eventType: "ace.settings.updated",
          payload: {
            changedSections,
          },
          idempotencyKey: `ace-settings:${actor.tenantId}:${randomUUID()}`,
        });

        return this.toResponse(
          site.timezone,
          pacePolicy,
          demeritPolicy,
          feature.updatedAt
            ? {
                communityEnabled: feature.enabled,
                updatedAt: new Date(feature.updatedAt),
              }
            : null,
        );
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException("ACE settings changed before this update completed");
      }
      throw error;
    }
  }

  private async requireSite(
    tx: Prisma.TransactionClient,
    actor: AceSettingsActor,
  ): Promise<{ timezone: string }> {
    const site = await tx.tenant.findFirst({
      where: { id: actor.tenantId, orgId: actor.orgId },
      select: { timezone: true },
    });
    if (!site) {
      throw new NotFoundException("Active site not found");
    }
    if (!isIanaTimezone(site.timezone)) {
      throw new BadRequestException("The active site has an invalid timezone");
    }
    return { timezone: site.timezone };
  }

  private async acquireSettingsWriteLock(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<void> {
    await tx.$executeRaw(
      Prisma.sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`${SETTINGS_WRITE_LOCK_PREFIX}:${tenantId}`}, 0)
        )
      `,
    );
  }

  private findCurrentPacePolicy(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<PacePolicy | null> {
    const now = new Date();
    return tx.pacePolicy.findFirst({
      where: {
        tenantId,
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
      },
      orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
      select: pacePolicySelect,
    });
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

  private async appendPacePolicy(
    tx: Prisma.TransactionClient,
    actor: AceSettingsActor,
    reason: string,
    change: UpdateAceSettingsDto["pacePolicy"] & {},
  ): Promise<PacePolicy> {
    const latestVersion = await tx.pacePolicy.aggregate({
      where: { tenantId: actor.tenantId },
      _max: { version: true },
    });
    return tx.pacePolicy.create({
      data: {
        tenantId: actor.tenantId,
        version: (latestVersion._max.version ?? 0) + 1,
        ...change,
        effectiveFrom: new Date(),
        effectiveTo: null,
        createdByUserId: actor.userId,
        reason,
      },
      select: pacePolicySelect,
    });
  }

  private async appendDemeritPolicy(
    tx: Prisma.TransactionClient,
    actor: AceSettingsActor,
    reason: string,
    change: UpdateAceSettingsDto["demeritPolicy"] & {},
  ): Promise<DemeritPolicy> {
    const latestVersion = await tx.demeritPolicy.aggregate({
      where: { tenantId: actor.tenantId },
      _max: { version: true },
    });
    return tx.demeritPolicy.create({
      data: {
        tenantId: actor.tenantId,
        version: (latestVersion._max.version ?? 0) + 1,
        ...change,
        effectiveFrom: new Date(),
        effectiveTo: null,
        createdByUserId: actor.userId,
        reason,
      },
      select: demeritPolicySelect,
    });
  }

  private async updateCommunityFeature(
    tx: Prisma.TransactionClient,
    tenantId: string,
    current: { communityEnabled: boolean; updatedAt: Date } | null,
    change: NonNullable<UpdateAceSettingsDto["features"]>["ace.student_community"],
  ): Promise<CommunityFeature> {
    if (!current) {
      if (change.expectedUpdatedAt !== null) {
        throw new ConflictException("Community feature settings changed before this update");
      }
      const created = await tx.aceCommunityPolicy.create({
        data: { tenantId, communityEnabled: change.enabled },
        select: { communityEnabled: true, updatedAt: true },
      });
      return this.toCommunityFeature(created);
    }

    if (change.expectedUpdatedAt !== current.updatedAt.toISOString()) {
      throw new ConflictException("Community feature settings changed before this update");
    }
    const updated = await tx.aceCommunityPolicy.updateMany({
      where: { tenantId, updatedAt: current.updatedAt },
      data: { communityEnabled: change.enabled },
    });
    if (updated.count !== 1) {
      throw new ConflictException("Community feature settings changed before this update");
    }
    const next = await tx.aceCommunityPolicy.findFirst({
      where: { tenantId },
      select: { communityEnabled: true, updatedAt: true },
    });
    if (!next) {
      throw new ConflictException("Community feature settings changed before this update");
    }
    return this.toCommunityFeature(next);
  }

  private assertCommand(command: UpdateAceSettingsDto): void {
    if (!command.pacePolicy && !command.demeritPolicy && !command.features) {
      throw new BadRequestException("At least one ACE setting must be changed");
    }
    if (!command.reason.trim()) {
      throw new BadRequestException("A reason is required for ACE settings changes");
    }
    const demerit = command.demeritPolicy;
    if (
      demerit &&
      (demerit.stageTwoThreshold <= demerit.stageOneThreshold ||
        demerit.stageThreeThreshold <= demerit.stageTwoThreshold)
    ) {
      throw new BadRequestException("Demerit thresholds must be strictly increasing");
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

  private toResponse(
    timezone: string,
    pacePolicy: PacePolicy | null,
    demeritPolicy: DemeritPolicy | null,
    communityPolicy: { communityEnabled: boolean; updatedAt: Date } | null,
  ): AceSettingsResponse {
    return {
      timezone,
      pacePolicy,
      demeritPolicy,
      features: { "ace.student_community": this.toCommunityFeature(communityPolicy) },
    };
  }

  private toCommunityFeature(
    policy: { communityEnabled: boolean; updatedAt: Date } | null,
  ): CommunityFeature {
    return {
      enabled: policy?.communityEnabled ?? false,
      updatedAt: policy?.updatedAt.toISOString() ?? null,
    };
  }
}

const pacePolicySelect = {
  id: true,
  version: true,
  selfTestPassingScore: true,
  paceTestPassingScore: true,
  maxAssessmentsPerDay: true,
  allowSamePaceSameDay: true,
  effectiveFrom: true,
  effectiveTo: true,
} satisfies Prisma.PacePolicySelect;

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

function isIanaTimezone(value: string | null): value is string {
  if (!value) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
