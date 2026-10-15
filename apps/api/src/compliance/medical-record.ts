import type { Prisma } from "@pathway/db";
import { isEncryptedField } from "@pathway/util";
import type {
  ComplianceMedicalRecord,
  MedicalField,
  WritableMedicalField,
} from "@pathway/types";

export const medicalSelect = {
  id: true,
  firstName: true,
  lastName: true,
  preferredName: true,
  yearGroup: true,
  allergies: true,
  allergiesConfirmedAt: true,
  medicalConditions: true,
  medicationAtSite: true,
  updatedAt: true,
} satisfies Prisma.ChildSelect;

type MedicalRow = Prisma.ChildGetPayload<{ select: typeof medicalSelect }>;

export function medicalField(
  value: string | null,
  confirmed: boolean,
): MedicalField {
  const details = value?.trim();
  if (details && isEncryptedField(details))
    return { status: "UNAVAILABLE", details: null };
  if (!details || details.toLowerCase() === "unknown")
    return { status: "UNKNOWN", details: null };
  if (details.toLowerCase() === "none")
    return { status: confirmed ? "NONE" : "UNKNOWN", details: null };
  return { status: "RECORDED", details };
}

export function medicalStorageValue(
  field: WritableMedicalField,
): string | null {
  return field.status === "RECORDED"
    ? field.details
    : field.status === "NONE"
      ? "none"
      : null;
}

export function serializeMedicalRecord(
  row: MedicalRow,
): ComplianceMedicalRecord {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    preferredName: row.preferredName,
    yearGroup: row.yearGroup,
    allergies: medicalField(row.allergies, row.allergiesConfirmedAt !== null),
    medicalConditions: medicalField(row.medicalConditions, true),
    medicationAtSite: medicalField(row.medicationAtSite, true),
    updatedAt: row.updatedAt.toISOString(),
  };
}
