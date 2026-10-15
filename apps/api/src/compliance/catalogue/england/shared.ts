import type { CatalogueRequirement, TrackerCatalogue } from "../schema";
export const englandReview = {
  reviewer: "Codex primary-source and applicability review (automated)",
  verifiedAt: "2026-10-15",
  reviewDueAt: "2027-01-12",
  revision: "england-2026-10-15-r1",
};
export const englandSectors: CatalogueRequirement["sectors"] = [
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
export function englandSource(input: SourceInput): Source {
  return {
    ...input,
    territory: ["GB-ENG"],
    language: "en",
    retrievedAt: "2026-10-15",
    review: englandReview,
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
export function englandRequirement(
  input: RequirementInput,
): CatalogueRequirement {
  return {
    version: 1,
    jurisdiction: "GB-ENG",
    sectors: englandSectors,
    allowsNotApplicable: false,
    notApplicablePolicy: null,
    effective: { from: "2026-10-15", to: null },
    review: englandReview,
    state: "PUBLISHED",
    materialChangeReason: "Initial reviewed England checklist action",
    supersedesVersion: null,
    reviewCadenceDays: 365,
    reviewCadenceBasis:
      "Portal planning reminder; review sooner on material change or source-specific triggers. This interval is not a universal statutory deadline.",
    ...input,
  };
}
