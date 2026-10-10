import { NotFoundException } from "@nestjs/common";
import { Prisma, prisma } from "@pathway/db";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";

export async function orgIdForInviteSite(tenantId: string): Promise<string> {
  const site = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { orgId: true },
  });
  if (!site) throw new NotFoundException("Invitation not found");
  return site.orgId;
}

export async function lockFamilyInvite(
  tx: Prisma.TransactionClient,
  ...parts: string[]
): Promise<void> {
  const key = `family-invite:${parts.join(":")}`;
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
  );
}

export async function auditFamilyInvite(
  tx: Prisma.TransactionClient,
  tenantId: string,
  orgId: string,
  actorUserId: string,
  inviteId: string,
  action: "create" | "resend" | "revoke" | "accept",
  metadata: Record<string, string> = {},
): Promise<void> {
  await recordAuditEventInTransaction(tx, {
    actorUserId,
    tenantId,
    orgId,
    entityType: AuditEntityType.ACE_RECORD,
    entityId: inviteId,
    action: action === "create" ? AuditAction.CREATED : AuditAction.UPDATED,
    metadata: { kind: "FAMILY_IDENTITY_INVITE", action, ...metadata },
  });
}
