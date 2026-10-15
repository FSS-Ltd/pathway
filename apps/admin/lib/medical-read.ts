import type {
  ComplianceMedicalRecord,
  ComplianceMedicalUpdate,
  MedicalField,
} from "@pathway/types";
export type MedicalValues = Pick<
  ComplianceMedicalRecord,
  "allergies" | "medicalConditions" | "medicationAtSite"
>;
type WritableMedicalValues = Pick<
  ComplianceMedicalUpdate,
  "allergies" | "medicalConditions" | "medicationAtSite"
>;
export function readableMedicalField(field: MedicalField): MedicalField {
  if (
    field.status === "UNAVAILABLE" ||
    (field.status === "RECORDED" && field.details.trimStart().startsWith("v1:"))
  )
    return { status: "UNAVAILABLE", details: null };
  return field;
}
export function readableMedicalValues(value: MedicalValues): MedicalValues {
  return {
    allergies: readableMedicalField(value.allergies),
    medicalConditions: readableMedicalField(value.medicalConditions),
    medicationAtSite: readableMedicalField(value.medicationAtSite),
  };
}
export function hasUnavailableMedical(value: MedicalValues): boolean {
  return Object.values(readableMedicalValues(value)).some(
    (field) => field.status === "UNAVAILABLE",
  );
}
export function writableMedicalValues(
  value: MedicalValues,
): value is WritableMedicalValues {
  return !hasUnavailableMedical(value);
}
export function readableMedicalRecord(
  value: ComplianceMedicalRecord,
): ComplianceMedicalRecord {
  return { ...value, ...readableMedicalValues(value) };
}
