import { Injectable } from "@nestjs/common";
import { prisma, type Prisma } from "@pathway/db";
import type { RecordAuditEventInput } from "./audit.types";

export async function recordAuditEventInTransaction(
  client: Prisma.TransactionClient,
  { actorUserId, tenantId, orgId, entityType, entityId, action, metadata }: RecordAuditEventInput,
): Promise<void> {
  await client.auditEvent.create({
    data: {
      actorUserId,
      tenantId: tenantId ?? null,
      orgId,
      entityType,
      entityId: entityId ?? null,
      action,
      metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
    },
  });
}

@Injectable()
export class AuditService {
  async recordEvent({
    actorUserId,
    tenantId,
    orgId,
    entityType,
    entityId,
    action,
    metadata,
  }: RecordAuditEventInput): Promise<void> {
    try {
      await recordAuditEventInTransaction(prisma, {
        actorUserId, tenantId, orgId, entityType, entityId, action, metadata,
      });
    } catch (error) {
      // best-effort logging without failing caller
      console.warn("[AuditService] Failed to record audit event", error);
    }
  }

}
