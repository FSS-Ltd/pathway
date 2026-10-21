import type { Sector } from "./sector";
import type { InstitutionalVertical } from "./institutional-profile";
import type { AgreementPdfInput } from "./agreements";
export const TRACKER_TOPICS = [
  "registration_governance",
  "safeguarding",
  "personnel",
  "privacy_records",
  "premises_safety",
  "education_childcare",
  "activities",
  "ace_icce",
] as const;
export type TrackerTopic = (typeof TRACKER_TOPICS)[number];
export type TrackerResearchSector = Sector | "NURSERY";
export interface TrackerProfileInput {
  jurisdictionId: string | null;
  region: string | null;
  localAuthority: string | null;
  belgianEducationCommunity?: "FLEMISH" | "FRENCH" | "GERMAN_SPEAKING" | null;
  belgianSchoolRecognitionStatus?:
    | "COMMUNITY_RECOGNISED"
    | "NOT_RECOGNISED"
    | "RECOGNISED_ELSEWHERE"
    | null;
  belgianChildcareAuthority?:
    | "OPGROEIEN"
    | "ONE"
    | "IRISCARE"
    | "GERMAN_COMMUNITY_MINISTRY"
    | null;
  belgianPaidUnderThreeCare?: boolean | null;
  sector: Sector | null;
  vertical: InstitutionalVertical | null;
  providerCategory:
    | "INDEPENDENT_SCHOOL"
    | "STATE_SCHOOL"
    | "EARLY_YEARS"
    | "CHILDCARE"
    | "OUT_OF_SCHOOL"
    | "OTHER"
    | null;
  schoolCategory?:
    | "MAINTAINED"
    | "ACADEMY"
    | "INDEPENDENT"
    | "NOT_SCHOOL"
    | null;
  englandSchoolMedicalDutiesApply?: boolean | null;
  personalDataController?: boolean | null;
  employsStaff?: boolean | null;
  controlsPremises?: boolean | null;
  foodBusiness?: boolean | null;
  operatesVehicles?: boolean | null;
  eyfsApplies?: boolean | null;
  fundingStatus: "PUBLIC" | "PRIVATE" | "MIXED" | null;
  minimumAge: number | null;
  maximumAge: number | null;
  provisionPattern: "FULL_TIME" | "PART_TIME" | "MIXED" | null;
  childcare: boolean | null;
  charitable: boolean | null;
  food: boolean | null;
  transport: boolean | null;
  trips: boolean | null;
  boarding: boolean | null;
  ace: boolean | null;
  icce: boolean | null;
}
export interface TrackerProfile {
  profile: TrackerProfileInput;
  version: number;
  updatedAt: string;
}
export interface TrackerJurisdiction {
  id: string;
  countryCode: string;
  subdivisionCode: string | null;
  name: string;
  level: string;
  parentJurisdictionId: string | null;
}
export type TrackerApplicability =
  | "APPLICABLE"
  | "NOT_APPLICABLE"
  | "UNRESOLVED";
export type TrackerAttestationStatus =
  | "COMPLETE"
  | "NOT_STARTED"
  | "NOT_APPLICABLE";
export type TrackerSignalKey =
  | "personnel"
  | "agreements"
  | "attendance"
  | "medical"
  | "safeguarding"
  | "trips"
  | "ace";
export interface TrackerSignal {
  key: TrackerSignalKey;
  status: "KNOWN" | "UNKNOWN";
  count: number | null;
  missingCount: number | null;
  description: string;
  observedAt: string;
  href: string | null;
}
export interface TrackerSource {
  id: string;
  url: string;
  title: string;
  authority: string;
  provision: string;
}
export interface TrackerRequirement {
  id: string;
  version: number;
  action: string;
  topic: TrackerTopic;
  obligationClass:
    | "STATUTORY_DUTY"
    | "STATUTORY_GUIDANCE"
    | "RECOMMENDATION"
    | "PROVIDER_REQUIREMENT";
  applicabilityExplanation: string;
  unknownExplanation: string;
  expectedEvidence: string[];
  allowsNotApplicable: boolean;
  sources: TrackerSource[];
  signalKeys: TrackerSignalKey[];
}
export interface TrackerAttestationInput {
  requirementId: string;
  requirementVersion: number;
  profileVersion: number;
  expectedRevision: number;
  status: TrackerAttestationStatus;
  notes: string;
  notApplicableReason: string | null;
  reviewDueAt: string | null;
}
export interface TrackerAttestation extends Omit<
  TrackerAttestationInput,
  "expectedRevision"
> {
  id: string;
  revision: number;
  requirement: TrackerRequirement;
  createdAt: string;
  createdByUserId: string;
}
export interface TrackerChecklistItem {
  requirement: TrackerRequirement;
  applicability: TrackerApplicability;
  applicabilityReason?: string;
  attestation: TrackerAttestation | null;
  completed: boolean;
  stale: boolean;
  overdue: boolean;
  evidenceCount: number;
  evidenceGap: boolean;
}
export interface TrackerProgress {
  completed: number;
  applicable: number;
  notApplicable: number;
  unresolved: number;
  stale: number;
  overdue: number;
  evidenceGaps: number;
}
export interface TrackerCategoryProgress extends TrackerProgress {
  topic: TrackerTopic;
}
export type TrackerCoverageStatus =
  | "NOT_REVIEWED"
  | "IN_REVIEW"
  | "REVIEWED"
  | "PUBLISHED"
  | "PARTIALLY_PUBLISHED"
  | "REVIEWED_NO_REQUIREMENTS"
  | "STALE"
  | "UNAVAILABLE"
  | "WITHDRAWN";
export interface TrackerCoverage {
  jurisdiction: string | null;
  sector: TrackerResearchSector | null;
  topic: TrackerTopic;
  status: TrackerCoverageStatus;
  regionalStatus: TrackerCoverageStatus;
  reason: string;
}
export interface TrackerChecklist {
  profile: TrackerProfile | null;
  organisationFacts?: {
    sector: Sector | null;
    vertical: InstitutionalVertical | null;
    ace: true | null;
  };
  profileNeedsSync?: boolean;
  items: TrackerChecklistItem[];
  progress: TrackerProgress;
  categories: TrackerCategoryProgress[];
  coverage: TrackerCoverage[];
  coverageGaps: number;
  observedAt: string;
}
export interface TrackerEvidenceInput {
  requirementId: string;
  requirementVersion: number;
  title: string;
  notes: string;
  pdf: AgreementPdfInput;
}
export interface TrackerEvidence {
  id: string;
  requirementId: string;
  requirementVersion: number;
  title: string;
  notes: string;
  fileName: string;
  createdAt: string;
  createdByUserId: string;
  archivedAt: string | null;
}
export interface TrackerEvidencePage {
  items: TrackerEvidence[];
  nextCursor: string | null;
}
export interface TrackerHistoryPage {
  items: TrackerAttestation[];
  nextCursor: string | null;
}

export interface TrackerHistoryRequirement {
  requirementId: string;
  requirementVersion: number;
  action: string | null;
}
export interface TrackerHistoryRequirementPage {
  items: TrackerHistoryRequirement[];
  nextCursor: string | null;
}
