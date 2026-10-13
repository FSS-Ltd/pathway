import { InternalServerErrorException } from "@nestjs/common";
import type { Prisma } from "@pathway/db";
import type { CompliancePersonnelRecord } from "@pathway/types";
import { z } from "zod";
import { complianceRecordFieldsSchema } from "./compliance.dto";

type StoredRecord = Prisma.CompliancePersonnelRecordGetPayload<
  Record<string, never>
>;

export function serializeComplianceRecord(
  record: StoredRecord,
): CompliancePersonnelRecord {
  return {
    id: record.id,
    version: record.version,
    subjectName: record.subjectName,
    subjectUserId: record.subjectUserId,
    roleDescription: record.roleDescription,
    kind: record.kind,
    scheme: record.scheme,
    title: record.title,
    provider: record.provider,
    reference: record.reference,
    completedOn: record.completedOn?.toISOString().slice(0, 10) ?? null,
    reviewDueOn: record.reviewDueOn?.toISOString().slice(0, 10) ?? null,
    status: record.status,
    notes: record.notes,
    verificationNotes: record.verificationNotes,
    verifiedAt: record.verifiedAt?.toISOString() ?? null,
    verifiedByUserId: record.verifiedByUserId,
    archivedAt: record.archivedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

const snapshotSchema = complianceRecordFieldsSchema.extend({
  id: z.string(),
  version: z.number().int().positive(),
  verifiedAt: z.string().datetime().nullable(),
  verifiedByUserId: z.string().nullable(),
  archivedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export function parseComplianceSnapshot(
  value: unknown,
): CompliancePersonnelRecord {
  const result = snapshotSchema.safeParse(value);
  if (!result.success)
    throw new InternalServerErrorException("Historical record is unavailable");
  return result.data;
}
