import type { CatalogueRequirement, TrackerCatalogue } from "../schema";

export const northernIrelandReview = {
  reviewer: "Codex primary-source and applicability review (automated)",
  verifiedAt: "2026-10-18",
  reviewDueAt: "2027-01-12",
  revision: "northern-ireland-2026-10-18-r1",
};

export const northernIrelandSectors: CatalogueRequirement["sectors"] = [
  "SCHOOL",
  "NURSERY",
  "CHURCH",
  "CHARITY",
  "CLUB",
  "LEARNING_CENTRE",
];

type Source = TrackerCatalogue["sources"][number];
type SourceInput = Pick<
  Source,
  | "id"
  | "url"
  | "title"
  | "authority"
  | "provision"
  | "classification"
  | "publishedAt"
  | "publishedDateUnknownReason"
  | "effective"
>;

export function northernIrelandSource(input: SourceInput): Source {
  return {
    ...input,
    territory: ["GB-NIR"],
    language: "en",
    retrievedAt: "2026-10-18",
    review: northernIrelandReview,
    state: "REVIEWED",
    translationProvenance: null,
  };
}

type RequirementInput = Pick<
  CatalogueRequirement,
  | "id"
  | "action"
  | "topic"
  | "obligationClass"
  | "condition"
  | "applicabilityExplanation"
  | "unknownExplanation"
  | "expectedEvidence"
  | "sourceIds"
  | "signalKeys"
> &
  Partial<
    Pick<
      CatalogueRequirement,
      | "allowsNotApplicable"
      | "notApplicablePolicy"
      | "reviewCadenceDays"
      | "reviewCadenceBasis"
    >
  >;

export function northernIrelandRequirement(
  input: RequirementInput,
): CatalogueRequirement {
  return {
    version: 1,
    jurisdiction: "GB-NIR",
    sectors: northernIrelandSectors,
    allowsNotApplicable: false,
    notApplicablePolicy: null,
    effective: { from: "2026-10-18", to: null },
    review: northernIrelandReview,
    state: "PUBLISHED",
    materialChangeReason: "Initial reviewed Northern Ireland checklist action",
    supersedesVersion: null,
    reviewCadenceDays: 365,
    reviewCadenceBasis:
      "Portal planning reminder; review sooner after material change or a source-specific trigger. This is not a universal statutory deadline.",
    ...input,
  };
}
