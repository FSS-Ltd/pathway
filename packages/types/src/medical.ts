/** Unknown information must never be presented as an explicit absence of needs. */
export type MedicalField =
  | { status: "UNAVAILABLE"; details: null }
  | { status: "UNKNOWN"; details: null }
  | { status: "NONE"; details: null }
  | { status: "RECORDED"; details: string };

/** Only readable states can be submitted as replacement clinical information. */
export type WritableMedicalField = Exclude<
  MedicalField,
  { status: "UNAVAILABLE" }
>;

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
  allergies: WritableMedicalField;
  medicalConditions: WritableMedicalField;
  medicationAtSite: WritableMedicalField;
}
