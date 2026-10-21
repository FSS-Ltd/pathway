import { NotFoundException } from "@nestjs/common";
import type { Prisma } from "@pathway/db";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import type { TripSlipActor } from "./trip-slip-access";

export async function lockSlip(
  tx: Prisma.TransactionClient,
  tenantId: string,
  slipId: string,
): Promise<void> {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "PermissionSlip"
    WHERE "id" = ${slipId} AND "tenantId" = ${tenantId}
    FOR UPDATE
  `;
  if (locked.length !== 1)
    throw new NotFoundException("Permission slip not found");
}

export async function latestVersion(
  tx: Prisma.TransactionClient,
  tenantId: string,
  slipId: string,
) {
  return tx.permissionSlipVersion.findFirst({
    where: { tenantId, permissionSlipId: slipId },
    orderBy: { version: "desc" },
  });
}

export async function auditSlip(
  tx: Prisma.TransactionClient,
  actor: TripSlipActor,
  slipId: string,
  state: string,
): Promise<void> {
  await recordAuditEventInTransaction(tx, {
    actorUserId: actor.userId,
    tenantId: actor.tenantId,
    orgId: actor.orgId,
    entityType: AuditEntityType.ACE_RECORD,
    entityId: slipId,
    action: AuditAction.UPDATED,
    metadata: { kind: "permission_slip", state },
  });
}
