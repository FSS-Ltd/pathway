import { randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@pathway/db";
import {
  accessTagPermissionKeys,
  isAccessTagAvailable,
  type AccessTagKey,
} from "@pathway/platform";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { OutboxService } from "../common/outbox/outbox.service";
import {
  fromStoredAccessTagKey,
  toStoredAccessTagKey,
} from "./access-tag-keys";
import { badgeAllowedScopes } from "./badge-matrix";
import {
  assertCanGrantAccessTag,
  assertFixedOrganisationHead,
} from "./access-tags.delegation";
import { roleApiError } from "./role-api-error";
import {
  ROLES_TRANSACTION_BOUNDARY,
  type RoleActorContext,
  type RolesTransactionBoundary,
} from "./roles.service";

export type BadgeState = "enabled" | "excluded" | "inherit";

export interface SetBadgeStateInput {
  userId: string;
  tagKey: AccessTagKey;
  scope: "organisation" | "site";
  state: BadgeState;
  expectedRevision: string;
}

interface CurrentBadgeRows {
  grants: Array<{ id: string }>;
  exclusions: Array<{ id: string }>;
}

export function badgeRevision(rows: CurrentBadgeRows): string {
  return [
    ...rows.grants.map(({ id }) => `g:${id}`),
    ...rows.exclusions.map(({ id }) => `e:${id}`),
  ]
    .sort()
    .join("|");
}

function mutationKey(
  actor: RoleActorContext,
  input: SetBadgeStateInput,
): string {
  return [
    "badge-state",
    actor.orgId,
    actor.userId,
    actor.requestId,
    input.userId,
    input.scope,
    input.tagKey,
    input.state,
    input.expectedRevision,
  ].join(":");
}

@Injectable()
export class BadgeStateService {
  constructor(
    @Inject(ROLES_TRANSACTION_BOUNDARY)
    private readonly transaction: RolesTransactionBoundary,
    @Inject(OutboxService)
    private readonly outbox: OutboxService,
  ) {}

  async set(actor: RoleActorContext, input: SetBadgeStateInput) {
    if (!isAccessTagAvailable(input.tagKey)) {
      throw roleApiError(
        HttpStatus.BAD_REQUEST,
        "ACCESS_TAG_UNAVAILABLE",
        actor.requestId,
      );
    }
    if (!badgeAllowedScopes(input.tagKey).includes(input.scope)) {
      throw roleApiError(
        HttpStatus.BAD_REQUEST,
        "ACCESS_TAG_INVALID_SCOPE",
        actor.requestId,
      );
    }
    const tenantId = input.scope === "site" ? actor.tenantId : null;
    if (input.scope === "site" && !tenantId) {
      throw roleApiError(
        HttpStatus.BAD_REQUEST,
        "INVALID_SELECTED_SITE",
        actor.requestId,
      );
    }
    return this.transaction.run(actor, async (tx) => {
      const now = new Date();
      await assertFixedOrganisationHead(tx, actor, now);
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${[
          "badge-state",
          actor.orgId,
          input.userId,
        ].join(":")}, 0))`,
      );
      const membership = await tx.orgMembership.findUnique({
        where: { orgId_userId: { orgId: actor.orgId, userId: input.userId } },
        select: {
          id: true,
          user: { select: { superUser: true, isActive: true } },
        },
      });
      if (!membership) {
        throw roleApiError(
          HttpStatus.BAD_REQUEST,
          "ASSIGNEE_NOT_IN_ORGANISATION",
          actor.requestId,
        );
      }
      if (membership.user?.superUser && membership.user.isActive) {
        throw roleApiError(
          HttpStatus.CONFLICT,
          "ACCESS_TAG_SUPERUSER_EXEMPT",
          actor.requestId,
        );
      }
      if (tenantId) {
        const siteMember = await tx.siteMembership.findUnique({
          where: { tenantId_userId: { tenantId, userId: input.userId } },
          select: { id: true },
        });
        if (!siteMember) {
          throw roleApiError(
            HttpStatus.BAD_REQUEST,
            "ACCESS_TAG_ASSIGNEE_NOT_IN_SITE",
            actor.requestId,
          );
        }
      }
      const where = {
        orgId: actor.orgId,
        tenantId,
        userId: input.userId,
        tagKey: toStoredAccessTagKey(input.tagKey),
        revokedAt: null,
      };
      const [grants, exclusions] = await Promise.all([
        tx.accessTagGrant.findMany({
          where,
          select: { id: true, startsAt: true, expiresAt: true },
        }),
        tx.accessTagExclusion.findMany({ where, select: { id: true } }),
      ]);
      const liveGrants = grants.filter(
        ({ startsAt, expiresAt }) =>
          startsAt <= now && (expiresAt === null || expiresAt > now),
      );
      const current = { grants: liveGrants, exclusions };
      const idempotencyKey = mutationKey(actor, input);
      const priorOperation = await tx.outboxEvent.findFirst({
        where: { idempotencyKey },
        select: { payload: true },
      });
      if (priorOperation) {
        const payload = priorOperation.payload;
        if (
          typeof payload !== "object" ||
          payload === null ||
          !("revision" in payload) ||
          payload.revision !== badgeRevision(current)
        ) {
          throw roleApiError(
            HttpStatus.CONFLICT,
            "BADGE_STATE_CONFLICT",
            actor.requestId,
          );
        }
        return { state: input.state, revision: badgeRevision(current) };
      }
      if (badgeRevision(current) !== input.expectedRevision) {
        throw roleApiError(
          HttpStatus.CONFLICT,
          "BADGE_STATE_CONFLICT",
          actor.requestId,
        );
      }

      let next: CurrentBadgeRows = current;
      if (input.state === "excluded" && exclusions.length === 0) {
        const exclusion = await tx.accessTagExclusion.create({
          data: {
            id: randomUUID(),
            orgId: actor.orgId,
            tenantId,
            userId: input.userId,
            tagKey: where.tagKey,
            excludedById: actor.userId,
          },
          select: { id: true },
        });
        next = { grants: liveGrants, exclusions: [exclusion] };
      } else if (input.state === "enabled") {
        await this.assertNoOverlappingExclusion(tx, actor, input, tenantId);
        const staleIds = grants
          .filter(({ id }) => !liveGrants.some((grant) => grant.id === id))
          .map(({ id }) => id);
        if (staleIds.length > 0) {
          await tx.accessTagGrant.updateMany({
            where: { ...where, id: { in: staleIds } },
            data: { revokedAt: now, revokedById: actor.userId },
          });
        }
        if (exclusions.length > 0) {
          await tx.accessTagExclusion.updateMany({
            where: { ...where, id: { in: exclusions.map(({ id }) => id) } },
            data: { revokedAt: now, revokedById: actor.userId },
          });
          next = { grants: liveGrants, exclusions: [] };
        }
        if (
          liveGrants.length === 0 &&
          !(await this.hasInheritedBadge(tx, actor, input, tenantId, now))
        ) {
          await assertCanGrantAccessTag(tx, actor, input, now);
          const grant = await tx.accessTagGrant.create({
            data: {
              id: randomUUID(),
              orgId: actor.orgId,
              tenantId,
              userId: input.userId,
              tagKey: where.tagKey,
              grantedById: actor.userId,
            },
            select: { id: true },
          });
          next = { grants: [grant], exclusions: [] };
        }
      } else if (input.state === "inherit") {
        if (grants.length > 0) {
          await tx.accessTagGrant.updateMany({
            where: { ...where, id: { in: grants.map(({ id }) => id) } },
            data: { revokedAt: now, revokedById: actor.userId },
          });
        }
        if (exclusions.length > 0) {
          await tx.accessTagExclusion.updateMany({
            where: { ...where, id: { in: exclusions.map(({ id }) => id) } },
            data: { revokedAt: now, revokedById: actor.userId },
          });
        }
        next = { grants: [], exclusions: [] };
      }

      if (badgeRevision(next) !== badgeRevision(current)) {
        await recordAuditEventInTransaction(tx, {
          actorUserId: actor.userId,
          orgId: actor.orgId,
          tenantId: tenantId ?? undefined,
          entityType: AuditEntityType.ACCESS_TAG_GRANT,
          entityId: input.userId,
          action: AuditAction.UPDATED,
          metadata: {
            requestId: actor.requestId,
            tagKey: input.tagKey,
            state: input.state,
            scope: input.scope,
          },
        });
        await this.outbox.enqueue(tx, {
          aggregateType: "user-access",
          aggregateId: input.userId,
          eventType: "access.tag.changed",
          payload: {
            action: input.state,
            orgId: actor.orgId,
            tenantId,
            tagKey: input.tagKey,
            requestId: actor.requestId,
            revision: badgeRevision(next),
          },
          idempotencyKey,
        });
      }
      return { state: input.state, revision: badgeRevision(next) };
    });
  }

  private async assertNoOverlappingExclusion(
    tx: Prisma.TransactionClient,
    actor: RoleActorContext,
    input: SetBadgeStateInput,
    tenantId: string | null | undefined,
  ): Promise<void> {
    const exclusions = await tx.accessTagExclusion.findMany({
      where: {
        orgId: actor.orgId,
        userId: input.userId,
        revokedAt: null,
        OR: [{ tenantId: null }, ...(tenantId ? [{ tenantId }] : [])],
      },
      select: { tagKey: true, tenantId: true },
    });
    const selectedKeys = new Set(accessTagPermissionKeys(input.tagKey));
    const blocking = exclusions
      .filter(
        ({ tagKey, tenantId: exclusionTenantId }) =>
          !(
            tagKey === toStoredAccessTagKey(input.tagKey) &&
            exclusionTenantId === tenantId
          ),
      )
      .map(({ tagKey }) => fromStoredAccessTagKey(tagKey))
      .filter((tagKey) =>
        accessTagPermissionKeys(tagKey).some((key) => selectedKeys.has(key)),
      );
    if (blocking.length > 0) {
      throw roleApiError(
        HttpStatus.CONFLICT,
        "BADGE_BLOCKED_BY_EXCLUSION",
        actor.requestId,
        {
          blockingTags: [...new Set(blocking)],
        },
      );
    }
  }

  private async hasInheritedBadge(
    tx: Prisma.TransactionClient,
    actor: RoleActorContext,
    input: SetBadgeStateInput,
    tenantId: string | null | undefined,
    now: Date,
  ): Promise<boolean> {
    const [assignments, broaderGrants] = await Promise.all([
      tx.userRoleAssignment.findMany({
        where: {
          orgId: actor.orgId,
          userId: input.userId,
          revokedAt: null,
          startsAt: { lte: now },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          roleDefinition: {
            isActive: true,
            OR: [
              { scope: "organisation", tenantId: null },
              ...(tenantId ? [{ scope: "site" as const, tenantId }] : []),
            ],
          },
        },
        select: {
          roleDefinition: {
            select: { permissions: { select: { permissionKey: true } } },
          },
        },
      }),
      tenantId
        ? tx.accessTagGrant.findMany({
            where: {
              orgId: actor.orgId,
              tenantId: null,
              userId: input.userId,
              tagKey: toStoredAccessTagKey(input.tagKey),
              revokedAt: null,
              startsAt: { lte: now },
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
            select: { id: true },
          })
        : Promise.resolve([]),
    ]);
    if (broaderGrants.length > 0) return true;
    const held = new Set(
      assignments.flatMap(({ roleDefinition }) =>
        roleDefinition.permissions.map(({ permissionKey }) => permissionKey),
      ),
    );
    return accessTagPermissionKeys(input.tagKey).every((key) => held.has(key));
  }
}
