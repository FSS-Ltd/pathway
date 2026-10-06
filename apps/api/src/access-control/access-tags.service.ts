import { randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { AccessTagGrant } from "@prisma/client";
import { Prisma } from "@pathway/db";
import {
  ACCESS_TAG_DEFINITIONS,
  accessTagPermissionKeys,
  isAccessTagAvailable,
} from "@pathway/platform";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { OutboxService } from "../common/outbox/outbox.service";
import {
  allAccessTagKeys,
  fromStoredAccessTagKey,
  toStoredAccessTagKey,
} from "./access-tag-keys";
import {
  assertCanGrantAccessTag,
  assertFixedOrganisationHead,
} from "./access-tags.delegation";
import type {
  AccessTagGrantInput,
  AccessTagGrantListQuery,
} from "./dto/access-tag.dto";
import { decodeCreatedAtIdCursor, encodeCreatedAtIdCursor } from "./cursor";
import { roleApiError } from "./role-api-error";
import {
  ROLES_TRANSACTION_BOUNDARY,
  type RoleActorContext,
  type RolesTransactionBoundary,
} from "./roles.service";

const DEFAULT_LIST_LIMIT = 50;

@Injectable()
export class AccessTagsService {
  constructor(
    @Inject(ROLES_TRANSACTION_BOUNDARY)
    private readonly transaction: RolesTransactionBoundary,
    @Inject(OutboxService)
    private readonly outbox: OutboxService,
  ) {}

  catalogue() {
    return allAccessTagKeys().map((key) => ({
      key,
      label: ACCESS_TAG_DEFINITIONS[key].label,
      description: ACCESS_TAG_DEFINITIONS[key].description,
      available: isAccessTagAvailable(key),
      permissionKeys: accessTagPermissionKeys(key),
    }));
  }

  async list(actor: RoleActorContext, query: AccessTagGrantListQuery = {}) {
    const limit = query.limit ?? DEFAULT_LIST_LIMIT;
    if (!Number.isInteger(limit) || limit < 1 || limit > DEFAULT_LIST_LIMIT) {
      throw roleApiError(
        HttpStatus.BAD_REQUEST,
        "INVALID_ACCESS_TAG_REQUEST",
        actor.requestId,
      );
    }
    const cursor = query.cursor
      ? parseCursor(query.cursor, actor.requestId)
      : undefined;
    return this.transaction.run(actor, async (tx) => {
      const rows = await tx.accessTagGrant.findMany({
        where: {
          orgId: actor.orgId,
          ...(query.userId ? { userId: query.userId } : {}),
          AND: [
            {
              OR: [
                { tenantId: null },
                ...(actor.tenantId ? [{ tenantId: actor.tenantId }] : []),
              ],
            },
            ...(cursor
              ? [
                  {
                    OR: [
                      { createdAt: { lt: cursor.createdAt } },
                      { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                    ],
                  },
                ]
              : []),
          ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
      });
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: page.map(toPublicGrant),
        nextCursor:
          rows.length > limit && last
            ? encodeCreatedAtIdCursor({
                createdAt: last.createdAt,
                id: last.id,
              })
            : null,
      };
    });
  }

  async grant(input: AccessTagGrantInput, actor: RoleActorContext) {
    const now = new Date();
    const startsAt = input.startsAt ?? now;
    if (
      (input.expiresAt && input.expiresAt <= startsAt) ||
      (input.expiresAt && input.expiresAt <= now)
    ) {
      throw roleApiError(
        HttpStatus.BAD_REQUEST,
        "INVALID_ACCESS_TAG_WINDOW",
        actor.requestId,
      );
    }
    return this.transaction.run(actor, async (tx) => {
      const tenantId = await assertCanGrantAccessTag(tx, actor, input, now);
      const tagKey = toStoredAccessTagKey(input.tagKey);
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${[
          "access-tag",
          actor.orgId,
          tenantId ?? "organisation",
          input.userId,
          input.tagKey,
        ].join(":")}, 0))`,
      );

      const existing = await tx.accessTagGrant.findFirst({
        where: {
          orgId: actor.orgId,
          tenantId,
          userId: input.userId,
          tagKey,
          revokedAt: null,
        },
      });
      if (existing && (!existing.expiresAt || existing.expiresAt > now)) {
        throw roleApiError(
          HttpStatus.CONFLICT,
          "ACCESS_TAG_ALREADY_GRANTED",
          actor.requestId,
        );
      }
      if (existing) {
        await tx.accessTagGrant.update({
          where: { id: existing.id },
          data: { revokedAt: now, revokedById: actor.userId },
        });
        await this.recordChange(tx, actor, existing, "revoked");
      }

      const grantId = randomUUID();
      let grant: AccessTagGrant;
      try {
        grant = await tx.accessTagGrant.create({
          data: {
            id: grantId,
            orgId: actor.orgId,
            tenantId,
            userId: input.userId,
            tagKey,
            grantedById: actor.userId,
            startsAt,
            expiresAt: input.expiresAt,
          },
        });
      } catch (error) {
        if (isUniqueConflict(error)) {
          throw roleApiError(
            HttpStatus.CONFLICT,
            "ACCESS_TAG_ALREADY_GRANTED",
            actor.requestId,
          );
        }
        throw error;
      }
      await this.recordChange(tx, actor, grant, "granted");
      return toPublicGrant(grant);
    });
  }

  async revoke(grantId: string, actor: RoleActorContext) {
    return this.transaction.run(actor, async (tx) => {
      const now = new Date();
      await assertFixedOrganisationHead(tx, actor, now);
      const grant = await tx.accessTagGrant.findFirst({
        where: {
          id: grantId,
          orgId: actor.orgId,
          OR: [
            { tenantId: null },
            ...(actor.tenantId ? [{ tenantId: actor.tenantId }] : []),
          ],
        },
      });
      if (!grant) {
        throw roleApiError(
          HttpStatus.NOT_FOUND,
          "ACCESS_TAG_GRANT_NOT_FOUND",
          actor.requestId,
        );
      }
      if (grant.revokedAt) {
        throw roleApiError(
          HttpStatus.CONFLICT,
          "ACCESS_TAG_ALREADY_REVOKED",
          actor.requestId,
        );
      }
      const updated = await tx.accessTagGrant.updateMany({
        where: { id: grant.id, orgId: actor.orgId, revokedAt: null },
        data: { revokedAt: now, revokedById: actor.userId },
      });
      if (updated.count !== 1) {
        throw roleApiError(
          HttpStatus.CONFLICT,
          "ACCESS_TAG_ALREADY_REVOKED",
          actor.requestId,
        );
      }
      await this.recordChange(tx, actor, grant, "revoked");
      return toPublicGrant({
        ...grant,
        revokedAt: now,
        revokedById: actor.userId,
      });
    });
  }

  private async recordChange(
    tx: Prisma.TransactionClient,
    actor: RoleActorContext,
    grant: AccessTagGrant,
    action: "granted" | "revoked",
  ): Promise<void> {
    const tagKey = fromStoredAccessTagKey(grant.tagKey);
    await recordAuditEventInTransaction(tx, {
      actorUserId: actor.userId,
      orgId: actor.orgId,
      tenantId: grant.tenantId ?? undefined,
      entityType: AuditEntityType.ACCESS_TAG_GRANT,
      entityId: grant.id,
      action: action === "granted" ? AuditAction.CREATED : AuditAction.UPDATED,
      metadata: {
        action,
        requestId: actor.requestId,
        userId: grant.userId,
        tagKey,
      },
    });
    await this.outbox.enqueue(tx, {
      aggregateType: "user-access",
      aggregateId: grant.userId,
      eventType: "access.tag.changed",
      payload: {
        action,
        grantId: grant.id,
        orgId: actor.orgId,
        tenantId: grant.tenantId,
        tagKey,
        requestId: actor.requestId,
      },
      idempotencyKey: ["access-tag", actor.requestId, action, grant.id].join(
        ":",
      ),
    });
  }
}

function toPublicGrant(grant: AccessTagGrant) {
  return { ...grant, tagKey: fromStoredAccessTagKey(grant.tagKey) };
}

function parseCursor(value: string, requestId: string) {
  try {
    return decodeCreatedAtIdCursor(value);
  } catch {
    throw roleApiError(
      HttpStatus.BAD_REQUEST,
      "INVALID_ACCESS_TAG_REQUEST",
      requestId,
    );
  }
}

function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
