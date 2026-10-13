import type { Prisma } from "@pathway/db";
import type {
  ComplianceRecordInput,
  CompliancePersonnelRecord,
} from "@pathway/types";
import type { ComplianceActor } from "./compliance.service";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";

export function complianceWriteValues(
  input: ComplianceRecordInput,
  actor: ComplianceActor,
): Omit<ComplianceRecordInput, "completedOn" | "reviewDueOn"> & {
  completedOn: Date | null;
  reviewDueOn: Date | null;
  verifiedAt: Date | null;
  verifiedByUserId: string | null;
  updatedByUserId: string;
} {
  return {
    ...input,
    completedOn: input.completedOn
      ? new Date(`${input.completedOn}T00:00:00.000Z`)
      : null,
    reviewDueOn: input.reviewDueOn
      ? new Date(`${input.reviewDueOn}T00:00:00.000Z`)
      : null,
    verifiedAt: input.status === "VERIFIED" ? new Date() : null,
    verifiedByUserId: input.status === "VERIFIED" ? actor.userId : null,
    updatedByUserId: actor.userId,
  };
}

export async function recordComplianceRevision(
  tx: Prisma.TransactionClient,
  record: CompliancePersonnelRecord,
  actor: ComplianceActor,
  operation: "created" | "updated" | "archived",
): Promise<void> {
  await tx.compliancePersonnelRevision.create({
    data: {
      tenantId: actor.tenantId,
      orgId: actor.orgId,
      recordId: record.id,
      version: record.version,
      actorUserId: actor.userId,
      snapshot: { ...record },
    },
  });
  await recordAuditEventInTransaction(tx, {
    tenantId: actor.tenantId,
    orgId: actor.orgId,
    actorUserId: actor.userId,
    entityType: AuditEntityType.COMPLIANCE_PERSONNEL,
    entityId: record.id,
    action: operation === "created" ? AuditAction.CREATED : AuditAction.UPDATED,
    metadata: { operation, version: record.version, kind: record.kind },
  });
}
