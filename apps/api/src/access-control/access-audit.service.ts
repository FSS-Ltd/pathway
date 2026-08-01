import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import { AuditEntityType } from "../audit/audit.types";
import { assertPlatformAccessRouteAccessWithShadow } from "./assert-platform-access";
import { AccessShadowService } from "./access-shadow.service";
import { decodeCreatedAtIdCursor, encodeCreatedAtIdCursor } from "./cursor";
import { roleApiError } from "./role-api-error";
import {
  ROLES_TRANSACTION_BOUNDARY,
  type RoleActorContext,
  type RolesTransactionBoundary,
} from "./roles.service";

const AUDIT_ENTITY_TYPES: readonly AuditEntityType[] = [
  AuditEntityType.ORG_ROLE,
  AuditEntityType.ROLE_ASSIGNMENT,
];

const DEFAULT_AUDIT_LIST_LIMIT = 50;
const MAX_AUDIT_LIST_LIMIT = 50;

export interface AuditListQuery {
  limit?: number;
  cursor?: string;
  entityType?: "ORG_ROLE" | "ROLE_ASSIGNMENT";
}

@Injectable()
export class AccessAuditService {
  constructor(
    @Inject(ROLES_TRANSACTION_BOUNDARY)
    private readonly transaction: RolesTransactionBoundary,
    @Inject(AccessShadowService)
    private readonly shadow: AccessShadowService,
  ) {}

  async list(actor: RoleActorContext, query: AuditListQuery = {}) {
    const limit = parseAuditListLimit(query.limit, actor);
    const cursor = query.cursor
      ? parseAuditCursor(query.cursor, actor)
      : undefined;
    const entityTypes: readonly AuditEntityType[] = query.entityType
      ? [AuditEntityType[query.entityType]]
      : AUDIT_ENTITY_TYPES;

    return this.transaction.run(actor, async (tx) => {
      await assertPlatformAccessRouteAccessWithShadow(
        tx,
        actor,
        "platform.access.audit.read",
        "AUDIT_API_ACCESS_DENIED",
        "GET /access/audit",
        this.shadow,
      );

      const rows = await tx.auditEvent.findMany({
        where: {
          orgId: actor.orgId,
          entityType: { in: [...entityTypes] },
          ...(cursor && {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
      });
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: page.map((event) => ({
          id: event.id,
          createdAt: event.createdAt,
          tenantId: event.tenantId,
          actorUserId: event.actorUserId,
          entityType: event.entityType,
          entityId: event.entityId,
          action: event.action,
          metadata: event.metadata,
        })),
        nextCursor:
          rows.length > limit && last
            ? encodeCreatedAtIdCursor({ createdAt: last.createdAt, id: last.id })
            : null,
      };
    });
  }
}

function parseAuditListLimit(
  limit: number | undefined,
  actor: RoleActorContext,
): number {
  if (limit === undefined) return DEFAULT_AUDIT_LIST_LIMIT;
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_AUDIT_LIST_LIMIT
  ) {
    throw roleApiError(HttpStatus.BAD_REQUEST, "INVALID_AUDIT_REQUEST", actor.requestId);
  }
  return limit;
}

function parseAuditCursor(
  encodedCursor: string,
  actor: RoleActorContext,
): ReturnType<typeof decodeCreatedAtIdCursor> {
  try {
    return decodeCreatedAtIdCursor(encodedCursor);
  } catch {
    throw roleApiError(HttpStatus.BAD_REQUEST, "INVALID_AUDIT_REQUEST", actor.requestId);
  }
}
