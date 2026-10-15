/** Unknown information must never be presented as an explicit absence of needs. */
export type MedicalField =
  | { status: "UNKNOWN"; details: null }
  | { status: "NONE"; details: null }
  | { status: "RECORDED"; details: string };

export interface ComplianceMedicalRecord {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  yearGroup: string | null;
  allergies: MedicalField;
  medicalConditions: MedicalField;
  medicationAtSite: MedicalField;
  updatedAt: string;
}

export interface ComplianceMedicalPage {
  items: ComplianceMedicalRecord[];
  nextCursor: string | null;
}

export interface ComplianceMedicalUpdate {
  expectedUpdatedAt: string;
  allergies: MedicalField;
  medicalConditions: MedicalField;
  medicationAtSite: MedicalField;
}
