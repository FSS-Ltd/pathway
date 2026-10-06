import type { Prisma } from "@pathway/db";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import { OutboxService } from "../common/outbox/outbox.service";
import type { RoleActorContext } from "./roles.service";

interface CutoverChange {
  actor: RoleActorContext;
  userId: string;
  tenantId: string | null;
  sourceAssignmentId: string;
}

export async function recordCutoverAssignmentChange(
  tx: Prisma.TransactionClient,
  outbox: OutboxService,
  change: CutoverChange & {
    assignmentId: string;
    roleDefinitionId: string;
    action: "assigned" | "revoked";
  },
): Promise<void> {
  const { actor, action, assignmentId, roleDefinitionId } = change;
  await recordAuditEventInTransaction(tx, {
    actorUserId: actor.userId,
    orgId: actor.orgId,
    tenantId: change.tenantId ?? undefined,
    entityType: AuditEntityType.ROLE_ASSIGNMENT,
    entityId: assignmentId,
    action:
      action === "assigned"
        ? AuditAction.ASSIGNMENT_CREATED
        : AuditAction.ASSIGNMENT_REVOKED,
    metadata: {
      requestId: actor.requestId,
      userId: change.userId,
      roleDefinitionId,
      cutoverFromAssignmentId: change.sourceAssignmentId,
    },
  });
  await outbox.enqueue(tx, {
    aggregateType: "user-access",
    aggregateId: change.userId,
    eventType: "access.assignment.changed",
    payload: {
      action,
      assignmentId,
      orgId: actor.orgId,
      tenantId: change.tenantId,
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

export async function recordCutoverTagGrant(
  tx: Prisma.TransactionClient,
  outbox: OutboxService,
  change: CutoverChange & {
    grantId: string;
    tagKey: string;
  },
): Promise<void> {
  const { actor } = change;
  await recordAuditEventInTransaction(tx, {
    actorUserId: actor.userId,
    orgId: actor.orgId,
    tenantId: change.tenantId ?? undefined,
    entityType: AuditEntityType.ACCESS_TAG_GRANT,
    entityId: change.grantId,
    action: AuditAction.CREATED,
    metadata: {
      action: "granted",
      requestId: actor.requestId,
      userId: change.userId,
      tagKey: change.tagKey,
      cutoverFromAssignmentId: change.sourceAssignmentId,
    },
  });
  await outbox.enqueue(tx, {
    aggregateType: "user-access",
    aggregateId: change.userId,
    eventType: "access.tag.changed",
    payload: {
      action: "granted",
      grantId: change.grantId,
      orgId: actor.orgId,
      tenantId: change.tenantId,
      tagKey: change.tagKey,
      requestId: actor.requestId,
    },
    idempotencyKey: [
      "access-tag",
      actor.requestId,
      "granted",
      change.grantId,
    ].join(":"),
  });
}
