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
import { acquireAceSettingsReadLock } from "../ace-settings/ace-settings-write-lock";
import { EffectivePermissionsService } from "../access-control/effective-permissions.service";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import { OutboxService } from "../common/outbox/outbox.service";
import { requireActiveBehaviourActor } from "./behaviour-actor";
import type { BehaviourActor } from "./behaviour-command.service";
import {
  currentReviewerKinds,
  findActiveReviewers,
} from "./behaviour-review-access";
import {
  currentLocalDate,
  isIanaTimezone,
  localDateWindowForDate,
} from "./demerit-escalation.support";
import { loadDemeritStageSnapshot } from "./demerit-stage.snapshot";
import type { DemeritOverrideDto } from "./dto/demerit-stage.dto";

@Injectable()
export class DemeritStageService {
  constructor(
    @Inject(EffectivePermissionsService)
    private readonly permissions: EffectivePermissionsService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  async status(actor: BehaviourActor, childId: string, date: string) {
    await requireActiveBehaviourActor(actor);
    await this.requirePermission(actor, "ace.behaviour.sensitive.read");
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const timezone = await this.requireScope(tx, actor, childId);
      const [siteStaff, orgAdmin, reviewerKinds] = await Promise.all([
        tx.siteMembership.findFirst({
          where: {
            tenantId: actor.tenantId,
            userId: actor.userId,
            role: { in: ["STAFF", "SITE_ADMIN"] },
          },
          select: { id: true },
        }),
        tx.orgMembership.findFirst({
          where: {
            orgId: actor.orgId,
            userId: actor.userId,
            role: "ORG_ADMIN",
          },
          select: { id: true },
        }),
        currentReviewerKinds(tx, actor, new Date()),
      ]);
      if (!siteStaff && !orgAdmin && reviewerKinds.length === 0) {
        throw new ForbiddenException("Staff behaviour access is required");
      }
      const now = new Date();
      if (date > currentLocalDate(now, timezone)) {
        throw new BadRequestException("A future demerit date is not available");
      }
      const snapshot = await loadDemeritStageSnapshot(
        tx,
        actor.tenantId,
        childId,
        date,
        timezone,
        now,
      );
      if (!snapshot) return null;
      return {
        childId: snapshot.childId,
        date: snapshot.date,
        policyVersion: snapshot.policyVersion,
        stage: snapshot.stage,
        stageLabel: snapshot.stageLabel,
        action: snapshot.action,
        requiresNote: snapshot.requiresNote,
        headReview: snapshot.headReview,
        manualStage: snapshot.manualStage,
        manualExpiresAt: snapshot.manualExpiresAt,
      };
    });
  }

  async override(actor: BehaviourActor, input: DemeritOverrideDto) {
    await requireActiveBehaviourActor(actor);
    await this.requirePermission(actor, "ace.behaviour.policy.manage");
    const keyHash = hash([
      "demerit-override",
      actor.tenantId,
      input.idempotencyKey,
    ]);
    const fingerprint = hash([
      actor.userId,
      input.childId,
      input.stage,
      input.expectedPolicyVersion,
      input.reason,
    ]);

    try {
      return await withTenantRlsContext(
        actor.tenantId,
        actor.orgId,
        async (tx) => {
          const timezone = await this.requireScope(tx, actor, input.childId);
          await tx.$executeRaw(Prisma.sql`
            SELECT pg_advisory_xact_lock(
              hashtextextended(${`ace-behaviour-entry:${actor.tenantId}:${input.childId}`}, 0)
            )
          `);
          await acquireAceSettingsReadLock(tx, actor.tenantId);
          const now = new Date();
          const kinds = await currentReviewerKinds(tx, actor, now);
          if (kinds.length === 0) {
            throw new ForbiddenException(
              "A current Head or Lead role is required",
            );
          }
          const existing = await tx.demeritStageOverride.findFirst({
            where: { tenantId: actor.tenantId, clientCommandKeyHash: keyHash },
            select: {
              id: true,
              commandFingerprint: true,
              stage: true,
              expiresAt: true,
            },
          });
          if (existing) {
            if (existing.commandFingerprint !== fingerprint) {
              throw new ConflictException(
                "Idempotency key belongs to another override",
              );
            }
            return {
              id: existing.id,
              stage: existing.stage,
              expiresAt: existing.expiresAt,
              duplicate: true,
            };
          }

          const date = currentLocalDate(now, timezone);
          const current = await loadDemeritStageSnapshot(
            tx,
            actor.tenantId,
            input.childId,
            date,
            timezone,
            now,
          );
          if (
            !current ||
            current.policyVersion !== input.expectedPolicyVersion
          ) {
            throw new ConflictException("The demerit policy changed");
          }
          if (input.stage <= current.stage) {
            throw new ConflictException("Stage must exceed the current stage");
          }
          const expiresAt = localDateWindowForDate(date, timezone, 1).end;
          const created = await tx.demeritStageOverride.create({
            data: {
              tenantId: actor.tenantId,
              childId: input.childId,
              demeritPolicyId: current.policyId,
              stage: input.stage,
              authorisedByUserId: actor.userId,
              reason: input.reason,
              expiresAt,
              clientCommandKeyHash: keyHash,
              commandFingerprint: fingerprint,
            },
            select: { id: true, stage: true, expiresAt: true },
          });
          await recordAuditEventInTransaction(tx, {
            actorUserId: actor.userId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            entityType: AuditEntityType.ACE_RECORD,
            entityId: created.id,
            action: AuditAction.CREATED,
            metadata: {
              operation: "DEMERIT_STAGE_OVERRIDDEN",
              childId: input.childId,
              policyVersion: current.policyVersion,
              stage: input.stage,
              expiresAt: expiresAt.toISOString(),
              reason: input.reason,
            },
          });
          await this.createReviewRequest(
            tx,
            actor,
            input.childId,
            created.id,
            input.stage,
            current.policyVersion,
            now,
          );
          return { ...created, duplicate: false };
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException(
          "Override changed before this request completed",
        );
      }
      throw error;
    }
  }

  private async createReviewRequest(
    tx: Prisma.TransactionClient,
    actor: BehaviourActor,
    childId: string,
    overrideId: string,
    stage: number,
    policyVersion: number,
    now: Date,
  ): Promise<void> {
    if (stage === 2) return;
    const kind = stage === 3 ? "HEAD" : "SITE";
    const recipientUserIds = await findActiveReviewers(tx, actor, kind, now);
    await this.outbox.enqueue(tx, {
      aggregateType: "DEMERIT_STAGE_OVERRIDE",
      aggregateId: overrideId,
      eventType: "behaviour.review-requested",
      payload: {
        demeritStageOverrideId: overrideId,
        childId,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        stage,
        demeritPolicyVersion: policyVersion,
        reviewKind: kind,
        recipientUserIds,
      },
      idempotencyKey: `behaviour-review-override:${overrideId}:${stage}:${kind.toLowerCase()}`,
    });
    await tx.behaviourReviewRequest.create({
      data: {
        tenantId: actor.tenantId,
        childId,
        demeritStageOverrideId: overrideId,
        kind,
        stage,
        policyVersion,
        requestedAt: now,
      },
    });
  }

  private async requireScope(
    tx: Prisma.TransactionClient,
    actor: BehaviourActor,
    childId: string,
  ): Promise<string> {
    const [site, child, vertical] = await Promise.all([
      tx.tenant.findFirst({
        where: { id: actor.tenantId, orgId: actor.orgId },
        select: { timezone: true },
      }),
      tx.child.findFirst({
        where: { id: childId, tenantId: actor.tenantId, isGuest: false },
        select: { id: true },
      }),
      tx.orgVertical.findFirst({
        where: { orgId: actor.orgId, vertical: "ACE_SCHOOL" },
        select: { orgId: true },
      }),
    ]);
    if (!site || !vertical) throw new NotFoundException("ACE site not found");
    if (!child) throw new NotFoundException("Child not found");
    if (!isIanaTimezone(site.timezone)) {
      throw new BadRequestException("The active site has an invalid timezone");
    }
    return site.timezone;
  }

  private async requirePermission(
    actor: BehaviourActor,
    permission: "ace.behaviour.policy.manage" | "ace.behaviour.sensitive.read",
  ): Promise<void> {
    const decision = await this.permissions.resolve({
      ...actor,
      permission,
      now: new Date(),
    });
    if (!decision.allowed)
      throw new ForbiddenException("Behaviour access denied");
  }
}

function hash(parts: readonly (string | number)[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}
