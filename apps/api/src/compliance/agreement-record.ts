import type { Prisma } from "@pathway/db";
import type { AgreementVersion, AgreementAssignment } from "@pathway/types";

export const assignmentInclude = {
  version: true,
  recipient: {
    select: { name: true, displayName: true, firstName: true, lastName: true },
  },
  acceptance: true,
} satisfies Prisma.ComplianceAgreementAssignmentInclude;
export type AssignmentRow = Prisma.ComplianceAgreementAssignmentGetPayload<{
  include: typeof assignmentInclude;
}>;
export type VersionRow = Prisma.ComplianceAgreementVersionGetPayload<
  Record<string, never>
>;
export function serializeVersion(row: VersionRow): AgreementVersion {
  return {
    id: row.id,
    documentId: row.documentId,
    version: row.version,
    title: row.title,
    contentText: row.contentText,
    hasOriginalFile: row.originalStorageKey !== null,
    createdAt: row.createdAt.toISOString(),
  };
}
export function personName(person: {
  name: string | null;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
}): string {
  return (
    person.displayName ||
    person.name ||
    [person.firstName, person.lastName].filter(Boolean).join(" ") ||
    "Portal user"
  );
}
export function serializeAssignment(row: AssignmentRow): AgreementAssignment {
  const acceptance = row.acceptance;
  return {
    id: row.id,
    version: serializeVersion(row.version),
    recipientUserId: row.recipientUserId,
    recipientName: personName(row.recipient),
    assignedAt: row.assignedAt.toISOString(),
    adultConfirmedAt: row.adultConfirmedAt.toISOString(),
    supersededAt: row.supersededAt?.toISOString() ?? null,
    acceptance: acceptance
      ? {
          id: acceptance.id,
          method: acceptance.method,
          typedName: acceptance.typedName,
          recordedAt: acceptance.recordedAt.toISOString(),
          recordedByUserId: acceptance.recordedByUserId,
          signedOn: acceptance.signedOn?.toISOString().slice(0, 10) ?? null,
          hasSignedCopy: acceptance.signedStorageKey !== null,
        }
      : null,
  };
}
export function page<T extends { id: string }>(
  rows: T[],
): { items: T[]; nextCursor: string | null } {
  const items = rows.slice(0, 50);
  return {
    items,
    nextCursor: rows.length > 50 ? items[items.length - 1].id : null,
  };
}
export function isAdult(dateOfBirth: Date | null, now = new Date()): boolean {
  if (!dateOfBirth) return true; // Caller retains explicit administrator confirmation.
  const cutoff = new Date(
    Date.UTC(now.getUTCFullYear() - 18, now.getUTCMonth(), now.getUTCDate()),
  );
  return dateOfBirth.getTime() <= cutoff.getTime();
}
