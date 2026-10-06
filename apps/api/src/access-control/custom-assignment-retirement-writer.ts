import { randomUUID } from "node:crypto";
import { applyTenantContext, type Prisma } from "@pathway/db";
import { OutboxService } from "../common/outbox/outbox.service";
import { allAccessTagKeys, toStoredAccessTagKey } from "./access-tag-keys";
import { assertCanGrantAccessTag } from "./access-tags.delegation";
import { CutoverPreviewError } from "./custom-assignment-parity-error";
import type { readCustomAssignmentInventory } from "./custom-assignment-parity-reader";
import {
  recordCutoverAssignmentChange,
  recordCutoverTagGrant,
} from "./custom-assignment-retirement-events";
import type { RoleActorContext } from "./roles.service";

type SourceAssignment = Awaited<
  ReturnType<typeof readCustomAssignmentInventory>
>["assignments"][number];

/** Writes replacements and their audit facts within one user's cutover transaction. */
export class CustomAssignmentRetirementWriter {
  constructor(private readonly outbox: OutboxService) {}

  async createFixedRoleAssignment(
    tx: Prisma.TransactionClient,
    actor: RoleActorContext,
    source: SourceAssignment,
    roleDefinitionId: string,
  ): Promise<boolean> {
    const tenantId = source.roleDefinition.tenantId;
    await applyTenantContext(tx, tenantId ?? "", actor.orgId);
    const fixedRole = await tx.orgRoleDefinition.findFirst({
      where: {
        id: roleDefinitionId,
        orgId: actor.orgId,
        tenantId,
        scope: source.roleDefinition.scope,
        isSystem: true,
        isActive: true,
      },
      select: { permissions: { select: { permissionKey: true } } },
    });
    const legacyKeys = new Set(
      source.roleDefinition.permissions.map(
        ({ permissionKey }) => permissionKey,
      ),
    );
    if (
      !fixedRole ||
      fixedRole.permissions.length === 0 ||
      fixedRole.permissions.some(
        ({ permissionKey }) => !legacyKeys.has(permissionKey),
      )
    ) {
      throw new CutoverPreviewError(
        `Fixed-role candidate changed for ${source.id}`,
      );
    }
    const existing = await tx.userRoleAssignment.findFirst({
      where: {
        orgId: actor.orgId,
        tenantId,
        userId: source.userId,
        roleDefinitionId,
        revokedAt: null,
        startsAt: { lte: source.startsAt },
        ...(source.expiresAt
          ? {
              OR: [
                { expiresAt: null },
                { expiresAt: { gte: source.expiresAt } },
              ],
            }
          : { expiresAt: null }),
      },
      select: { id: true },
    });
    if (existing) return false;
    const assignmentId = randomUUID();
    await tx.userRoleAssignment.create({
      data: {
        id: assignmentId,
        orgId: actor.orgId,
        tenantId,
        userId: source.userId,
        roleDefinitionId,
        assignedById: actor.userId,
        startsAt: source.startsAt,
        expiresAt: source.expiresAt,
      },
    });
    await recordCutoverAssignmentChange(tx, this.outbox, {
      actor,
      action: "assigned",
      assignmentId,
      roleDefinitionId,
      userId: source.userId,
      tenantId,
      sourceAssignmentId: source.id,
    });
    return true;
  }

  async createTagGrant(
    tx: Prisma.TransactionClient,
    actor: RoleActorContext,
    source: SourceAssignment,
    requestedTagKey: string,
    now: Date,
  ): Promise<boolean> {
    const tagKey = allAccessTagKeys().find((key) => key === requestedTagKey);
    if (!tagKey) throw new CutoverPreviewError("Unknown access-tag key");
    const tenantId = source.roleDefinition.tenantId;
    await applyTenantContext(tx, tenantId ?? "", actor.orgId);
    await assertCanGrantAccessTag(
      tx,
      { ...actor, tenantId: tenantId ?? undefined },
      {
        userId: source.userId,
        tagKey,
        scope: tenantId ? "site" : "organisation",
      },
      now,
    );
    const existing = await tx.accessTagGrant.findFirst({
      where: {
        orgId: actor.orgId,
        tenantId,
        userId: source.userId,
        tagKey: toStoredAccessTagKey(tagKey),
        revokedAt: null,
      },
    });
    if (existing) {
      if (
        existing.startsAt > source.startsAt ||
        (source.expiresAt === null && existing.expiresAt !== null) ||
        (source.expiresAt !== null &&
          existing.expiresAt !== null &&
          existing.expiresAt < source.expiresAt)
      ) {
        throw new CutoverPreviewError(
          `Existing tag grant does not cover ${source.id}`,
        );
      }
      return false;
    }
    const grantId = randomUUID();
    await tx.accessTagGrant.create({
      data: {
        id: grantId,
        orgId: actor.orgId,
        tenantId,
        userId: source.userId,
        tagKey: toStoredAccessTagKey(tagKey),
        grantedById: actor.userId,
        startsAt: source.startsAt,
        expiresAt: source.expiresAt,
      },
    });
    await recordCutoverTagGrant(tx, this.outbox, {
      actor,
      grantId,
      tagKey,
      userId: source.userId,
      tenantId,
      sourceAssignmentId: source.id,
    });
    return true;
  }

  async revokeCustomAssignment(
    tx: Prisma.TransactionClient,
    actor: RoleActorContext,
    source: SourceAssignment,
    now: Date,
  ): Promise<void> {
    const tenantId = source.roleDefinition.tenantId;
    await applyTenantContext(tx, tenantId ?? "", actor.orgId);
    const updated = await tx.userRoleAssignment.updateMany({
      where: {
        id: source.id,
        orgId: actor.orgId,
        userId: source.userId,
        revokedAt: null,
      },
      data: { revokedAt: now, revokedById: actor.userId },
    });
    if (updated.count !== 1) {
      throw new CutoverPreviewError(
        `Assignment changed during cutover: ${source.id}`,
      );
    }
    await recordCutoverAssignmentChange(tx, this.outbox, {
      actor,
      action: "revoked",
      assignmentId: source.id,
      roleDefinitionId: source.roleDefinition.id,
      userId: source.userId,
      tenantId,
      sourceAssignmentId: source.id,
    });
  }
}
