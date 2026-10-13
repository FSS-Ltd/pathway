/** Institutional personnel records; recording evidence is not legal certification. */
export const COMPLIANCE_RECORD_KINDS = [
  "BACKGROUND_CHECK",
  "SAFEGUARDING_TRAINING",
  "FIRST_AID",
  "QUALIFICATION",
  "OTHER_TRAINING",
] as const;
export type ComplianceRecordKind = (typeof COMPLIANCE_RECORD_KINDS)[number];
export const COMPLIANCE_CHECK_SCHEMES = [
  "DBS",
  "PVG",
  "ACCESSNI",
  "LOCAL",
] as const;
export type ComplianceCheckScheme = (typeof COMPLIANCE_CHECK_SCHEMES)[number];
export const COMPLIANCE_RECORD_STATUSES = [
  "PENDING",
  "RECORDED",
  "VERIFIED",
] as const;
export type ComplianceRecordStatus =
  (typeof COMPLIANCE_RECORD_STATUSES)[number];

export interface ComplianceRecordInput {
  subjectName: string;
  subjectUserId: string | null;
  roleDescription: string;
  kind: ComplianceRecordKind;
  scheme: ComplianceCheckScheme | null;
  title: string;
  provider: string | null;
  reference: string | null;
  completedOn: string | null;
  reviewDueOn: string | null;
  status: ComplianceRecordStatus;
  notes: string | null;
  verificationNotes: string | null;
}

export interface CompliancePersonnelRecord extends ComplianceRecordInput {
  id: string;
  version: number;
  verifiedAt: string | null;
  verifiedByUserId: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceRecordPage {
  items: CompliancePersonnelRecord[];
  nextCursor: string | null;
  summary: {
    active: number;
    overdueReview: number;
    awaitingVerification: number;
  };
}

export interface ComplianceRecordRevision {
  id: string;
  version: number;
  actorUserId: string;
  createdAt: string;
  snapshot: CompliancePersonnelRecord;
}

export interface ComplianceRevisionPage {
  items: ComplianceRecordRevision[];
  nextCursor: string | null;
}

export interface CompliancePersonOption {
  id: string;
  name: string;
}
export interface CompliancePeoplePage {
  items: CompliancePersonOption[];
}

/** A bounded export; nextCursor identifies any remaining historical revisions. */
export interface ComplianceRecordExport {
  record: CompliancePersonnelRecord;
  history: ComplianceRevisionPage;
  exportedAt: string;
}
