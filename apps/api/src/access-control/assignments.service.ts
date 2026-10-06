import { randomUUID } from "node:crypto";
import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@pathway/db";
import {
  AuditAction,
  AuditEntityType,
} from "../audit/audit.types";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { OutboxService } from "../common/outbox/outbox.service";
import { AccessCacheService } from "./access-cache.service";
import { decodeCreatedAtIdCursor, encodeCreatedAtIdCursor } from "./cursor";
import { roleApiError } from "./role-api-error";
import { RoleSafetyService } from "./role-safety.service";
import {
  ROLES_TRANSACTION_BOUNDARY,
  type RoleActorContext,
  type RolesTransactionBoundary,
} from "./roles.service";

export interface AssignRoleCommand {
  userId: string;
  roleDefinitionId: string;
  orgId: string;
  tenantId?: string;
  startsAt: Date;
  expiresAt?: Date;
}

export interface AssignmentListQuery {
  limit?: number;
  cursor?: string;
}

const DEFAULT_ASSIGNMENT_LIST_LIMIT = 50;
const MAX_ASSIGNMENT_LIST_LIMIT = 50;

interface PreparedAssignment {
  inputIndex: number;
  command: AssignRoleCommand;
  role: {
    id: string;
    orgId: string;
    tenantId: string | null;
    scope: "organisation" | "site" | "relationship";
  };
}

@Injectable()
export class AssignmentsService {
  constructor(
    @Inject(ROLES_TRANSACTION_BOUNDARY)
    private readonly transaction: RolesTransactionBoundary,
    @Inject(OutboxService)
    private readonly outbox: OutboxService,
    @Inject(AccessCacheService)
    private readonly cache: AccessCacheService,
    @Inject(RoleSafetyService)
    private readonly roleSafety: RoleSafetyService,
  ) {}

  async list(
    actor: RoleActorContext,
    input: AssignmentListQuery = {},
  ) {
    const limit = parseAssignmentListLimit(input.limit, actor);
    const cursor = input.cursor
      ? parseAssignmentCursor(input.cursor, actor)
      : undefined;
    return this.transaction.run(actor, async (tx) => {
      await tx.$queryRawUnsafe(
        "SELECT set_config('app.assignment_org_read', 'on', true)",
      );
      const rows = await tx.userRoleAssignment.findMany({
        where: {
          orgId: actor.orgId,
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
        items: page.map((assignment) => ({
          id: assignment.id,
          orgId: assignment.orgId,
          tenantId: assignment.tenantId,
          userId: assignment.userId,
          roleDefinitionId: assignment.roleDefinitionId,
          assignedById: assignment.assignedById,
          startsAt: assignment.startsAt,
          expiresAt: assignment.expiresAt,
          revokedAt: assignment.revokedAt,
          revokedById: assignment.revokedById,
        })),
        nextCursor:
          rows.length > limit && last
            ? encodeAssignmentCursor(last.createdAt, last.id)
            : null,
      };
    });
  }

  async assign(
    commands: readonly AssignRoleCommand[],
    actor: RoleActorContext,
  ) {
    const assignments = await this.transaction.run(actor, async (tx) => {
      const prepared = [];
      for (const [inputIndex, command] of commands.entries()) {
        prepared.push(
          await this.prepareAssignment(tx, command, actor, inputIndex),
        );
      }

      const created = [];
      for (const assignment of [...prepared].sort(compareAssignments)) {
        created.push({
          inputIndex: assignment.inputIndex,
          value: await this.createAssignment(tx, assignment, actor),
        });
      }
      return created
        .sort((left, right) => left.inputIndex - right.inputIndex)
        .map(({ value }) => value);
    });

    await this.invalidateUsers(
      assignments.map((assignment) => assignment.userId),
      actor.orgId,
    );
    return assignments;
  }

  async revoke(assignmentId: string, actor: RoleActorContext) {
    const assignment = await this.transaction.run(actor, async (tx) => {
      const existing = await tx.userRoleAssignment.findFirst({
        where: { id: assignmentId, orgId: actor.orgId },
      });
      if (!existing) {
        throw roleApiError(
          HttpStatus.NOT_FOUND,
          "ASSIGNMENT_NOT_FOUND",
          actor.requestId,
        );
      }
      if (existing.revokedAt) {
        throw roleApiError(
          HttpStatus.CONFLICT,
          "ASSIGNMENT_ALREADY_REVOKED",
          actor.requestId,
        );
      }

      const revokedAt = new Date();
      await this.roleSafety.assertHeadAndSelfLockoutSafe({
        tx,
        actorUserId: actor.userId,
        orgId: actor.orgId,
        requestId: actor.requestId,
        mutate: async () => {
          const updated = await tx.userRoleAssignment.updateMany({
            where: { id: assignmentId, orgId: actor.orgId, revokedAt: null },
            data: { revokedAt, revokedById: actor.userId },
          });
          if (updated.count !== 1) {
            throw roleApiError(
              HttpStatus.CONFLICT,
              "ASSIGNMENT_ALREADY_REVOKED",
              actor.requestId,
            );
          }
        },
      });

      await this.recordChange(tx, {
        actor,
        assignmentId: existing.id,
        userId: existing.userId,
        roleDefinitionId: existing.roleDefinitionId,
        tenantId: existing.tenantId ?? undefined,
        action: "revoked",
      });
      return {
        ...existing,
        revokedAt,
        revokedById: actor.userId,
      };
    });

    await this.invalidateUsers([assignment.userId], actor.orgId);
    return assignment;
  }

  private async prepareAssignment(
    tx: Prisma.TransactionClient,
    command: AssignRoleCommand,
    actor: RoleActorContext,
    inputIndex: number,
  ): Promise<PreparedAssignment> {
    if (
      command.orgId !== actor.orgId ||
      command.tenantId !== actor.tenantId
    ) {
      throw roleApiError(
        HttpStatus.FORBIDDEN,
        "INVALID_ASSIGNMENT_SCOPE",
        actor.requestId,
      );
    }
    if (command.expiresAt && command.expiresAt <= command.startsAt) {
      throw roleApiError(
        HttpStatus.BAD_REQUEST,
        "INVALID_ASSIGNMENT_WINDOW",
        actor.requestId,
      );
    }

    const role = await tx.orgRoleDefinition.findFirst({
      where: {
        id: command.roleDefinitionId,
        orgId: actor.orgId,
        isActive: true,
        isSystem: true,
      },
      select: {
        id: true,
        orgId: true,
        tenantId: true,
        scope: true,
      },
    });
    if (!role) {
      throw roleApiError(
        HttpStatus.BAD_REQUEST,
        "ROLE_NOT_ASSIGNABLE",
        actor.requestId,
      );
    }
    if (
      role.scope === "relationship" ||
      (role.scope === "site" &&
        (!actor.tenantId || role.tenantId !== actor.tenantId))
    ) {
      throw roleApiError(
        role.scope === "relationship"
          ? HttpStatus.BAD_REQUEST
          : HttpStatus.FORBIDDEN,
        role.scope === "relationship"
          ? "ROLE_NOT_ASSIGNABLE"
          : "INVALID_ASSIGNMENT_SCOPE",
        actor.requestId,
      );
    }

    const membership = await tx.orgMembership.findUnique({
      where: {
        orgId_userId: { orgId: actor.orgId, userId: command.userId },
      },
      select: { id: true },
    });
    if (!membership) {
      throw roleApiError(
        HttpStatus.BAD_REQUEST,
        "ASSIGNEE_NOT_IN_ORGANISATION",
        actor.requestId,
      );
    }

    return { inputIndex, command, role };
  }

  private async createAssignment(
    tx: Prisma.TransactionClient,
    { command, role }: PreparedAssignment,
    actor: RoleActorContext,
  ) {
    const assignmentId = randomUUID();
    let assignment;
    try {
      assignment = await tx.userRoleAssignment.create({
        data: {
          id: assignmentId,
          orgId: actor.orgId,
          tenantId: role.tenantId,
          userId: command.userId,
          roleDefinitionId: role.id,
          assignedById: actor.userId,
          startsAt: command.startsAt,
          expiresAt: command.expiresAt,
        },
      });
    } catch (error) {
      if (isAssignmentOverlapError(error)) {
        throw roleApiError(
          HttpStatus.CONFLICT,
          "ASSIGNMENT_OVERLAP",
          actor.requestId,
        );
      }
      if (isAssignmentConstraintError(error)) {
        throw roleApiError(
          HttpStatus.BAD_REQUEST,
          "INVALID_ASSIGNMENT_SCOPE",
          actor.requestId,
        );
      }
      throw error;
    }
    await this.recordChange(tx, {
      actor,
      assignmentId,
      userId: command.userId,
      roleDefinitionId: role.id,
      tenantId: role.tenantId ?? undefined,
      action: "assigned",
    });
    return assignment;
  }

  private async recordChange(
    tx: Prisma.TransactionClient,
    input: {
      actor: RoleActorContext;
      assignmentId: string;
      userId: string;
      roleDefinitionId: string;
      tenantId?: string;
      action: "assigned" | "revoked";
    },
  ): Promise<void> {
    const { actor, assignmentId, userId, roleDefinitionId, tenantId, action } =
      input;
    await recordAuditEventInTransaction(tx, {
      actorUserId: actor.userId,
      tenantId,
      orgId: actor.orgId,
      entityType: AuditEntityType.ROLE_ASSIGNMENT,
      entityId: assignmentId,
      action:
        action === "assigned"
          ? AuditAction.ASSIGNMENT_CREATED
          : AuditAction.ASSIGNMENT_REVOKED,
      metadata: {
        requestId: actor.requestId,
        userId,
        roleDefinitionId,
      },
    });
    await this.outbox.enqueue(tx, {
      aggregateType: "user-access",
      aggregateId: userId,
      eventType: "access.assignment.changed",
      payload: {
        action,
        assignmentId,
        orgId: actor.orgId,
        tenantId: tenantId ?? null,
        requestId: actor.requestId,
      },
      idempotencyKey: [
        "access-assignment",
        actor.requestId,
        action,
        assignmentId,
      ].join(":"),
    });
  }


  private async invalidateUsers(
    userIds: readonly string[],
    orgId: string,
  ): Promise<void> {
    await Promise.allSettled(
      [...new Set(userIds)].map((userId) =>
        this.cache.invalidateUser(userId, orgId),
      ),
    );
  }
}

function parseAssignmentListLimit(
  limit: number | undefined,
  actor: RoleActorContext,
): number {
  if (limit === undefined) return DEFAULT_ASSIGNMENT_LIST_LIMIT;
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_ASSIGNMENT_LIST_LIMIT
  ) {
    throw roleApiError(
      HttpStatus.BAD_REQUEST,
      "INVALID_ASSIGNMENT_REQUEST",
      actor.requestId,
    );
  }
  return limit;
}

function parseAssignmentCursor(
  encodedCursor: string,
  actor: RoleActorContext,
): ReturnType<typeof decodeCreatedAtIdCursor> {
  try {
    return decodeCreatedAtIdCursor(encodedCursor);
  } catch {
    throw roleApiError(
      HttpStatus.BAD_REQUEST,
      "INVALID_ASSIGNMENT_REQUEST",
      actor.requestId,
    );
  }
}

function encodeAssignmentCursor(createdAt: Date, id: string): string {
  return encodeCreatedAtIdCursor({ createdAt, id });
}

function isAssignmentConstraintError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as {
    code?: unknown;
    message?: unknown;
    meta?: {
      code?: unknown;
      database_error?: unknown;
    };
  };
  const diagnostic = [candidate.message, candidate.meta?.database_error]
    .filter((value): value is string => typeof value === "string");
  return (
    candidate.code === "P2003" ||
    candidate.code === "23503" ||
    candidate.code === "23514" ||
    candidate.meta?.code === "23503" ||
    candidate.meta?.code === "23514" ||
    diagnostic.some((value) =>
      /(?:^|[^A-Z0-9])(?:23503|23514)(?:[^A-Z0-9]|$)/.test(value),
    )
  );
}

function isAssignmentOverlapError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as {
    code?: unknown;
    message?: unknown;
    meta?: {
      code?: unknown;
      database_error?: unknown;
    };
  };
  const diagnostic = [candidate.message, candidate.meta?.database_error]
    .filter((value): value is string => typeof value === "string");
  return (
    candidate.code === "PRA01" ||
    candidate.meta?.code === "PRA01" ||
    diagnostic.some((value) =>
      /(?:^|[^A-Z0-9])PRA01(?:[^A-Z0-9]|$)/.test(value),
    )
  );
}

function compareAssignments(
  left: PreparedAssignment,
  right: PreparedAssignment,
): number {
  return (
    compareStrings(left.role.orgId, right.role.orgId) ||
    compareNullableStrings(left.role.tenantId, right.role.tenantId) ||
    compareStrings(left.command.userId, right.command.userId) ||
    compareStrings(left.role.id, right.role.id) ||
    compareNumbers(
      left.command.startsAt.getTime(),
      right.command.startsAt.getTime(),
    ) ||
    compareOptionalDates(left.command.expiresAt, right.command.expiresAt) ||
    left.inputIndex - right.inputIndex
  );
}

function compareNullableStrings(
  left: string | null,
  right: string | null,
): number {
  if (left === right) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  return compareStrings(left, right);
}

function compareStrings(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function compareOptionalDates(left?: Date, right?: Date): number {
  if (left === undefined && right === undefined) return 0;
  if (left === undefined) return 1;
  if (right === undefined) return -1;
  return compareNumbers(left.getTime(), right.getTime());
}

function compareNumbers(left: number, right: number): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
