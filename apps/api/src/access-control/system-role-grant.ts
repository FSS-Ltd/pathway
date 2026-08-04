import { randomUUID } from "node:crypto";
import {
  SYSTEM_ACTOR_ID,
  applyTenantContext,
  getSystemRoleId,
  type Prisma,
} from "@pathway/db";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { OutboxService } from "../common/outbox/outbox.service";

export type SystemRoleTemplateKey = "organisationHead" | "siteLead";

export type GrantSystemRoleAssignmentResult =
  | "granted"
  | "already-granted"
  | "no-template";

/**
 * Grants a newly org/site-admin'd user the org's already-seeded system role
 * (Organisation Head for org scope, Site Lead for site scope), the same way
 * apps/api/scripts/backfill-org-head-assignments.ts backfills legacy admins.
 *
 * No-ops (returns "no-template") when the org's system role hasn't been
 * seeded yet - pnpm db:seed populates OrgRoleDefinition via a dedicated,
 * database-trigger-protected identity that application code cannot assume
 * (see packages/db/prisma/migrations/20260727170000_dedicated_system_role_seed).
 * Callers must not treat that as an error: it means the user keeps their
 * legacy OrgMembership/SiteMembership role until the next `pnpm db:seed` +
 * `access:backfill --apply` pass picks them up.
 */
export async function grantSystemRoleAssignment(
  tx: Prisma.TransactionClient,
  outbox: OutboxService,
  params: {
    orgId: string;
    tenantId: string | null;
    userId: string;
    templateKey: SystemRoleTemplateKey;
    source: string;
  },
): Promise<GrantSystemRoleAssignmentResult> {
  const { orgId, tenantId, userId, templateKey, source } = params;
  const roleDefinitionId = getSystemRoleId(orgId, tenantId, templateKey);
  const role = await tx.orgRoleDefinition.findUnique({
    where: { id: roleDefinitionId },
    select: { isActive: true, isSystem: true },
  });
  if (!role || !role.isActive || !role.isSystem) {
    return "no-template";
  }

  const now = new Date();
  const existing = await tx.userRoleAssignment.findFirst({
    where: {
      orgId,
      userId,
      roleDefinitionId,
      revokedAt: null,
      startsAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { id: true },
  });
  if (existing) {
    return "already-granted";
  }

  await applyTenantContext(tx, tenantId ?? "", orgId);

  const assignmentId = randomUUID();
  await tx.userRoleAssignment.create({
    data: {
      id: assignmentId,
      orgId,
      tenantId,
      userId,
      roleDefinitionId,
      assignedById: SYSTEM_ACTOR_ID,
      startsAt: now,
    },
  });
  await recordAuditEventInTransaction(tx, {
    actorUserId: SYSTEM_ACTOR_ID,
    orgId,
    tenantId: tenantId ?? undefined,
    entityType: AuditEntityType.ROLE_ASSIGNMENT,
    entityId: assignmentId,
    action: AuditAction.ASSIGNMENT_CREATED,
    metadata: { source, roleDefinitionId, userId },
  });
  await outbox.enqueue(tx, {
    aggregateType: "user-access",
    aggregateId: userId,
    eventType: "access.assignment.changed",
    payload: {
      action: "assigned",
      assignmentId,
      orgId,
      tenantId: tenantId ?? null,
      requestId: `${source}:${orgId}:${userId}`,
    },
    idempotencyKey: `access-assignment:${source}:${orgId}:${userId}`,
  });

  return "granted";
}
