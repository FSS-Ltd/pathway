import type { CatalogueRequirement, TrackerCatalogue } from "../schema";
export const walesReview = {
  reviewer: "Codex primary-source and applicability review (automated)",
  verifiedAt: "2026-10-17",
  reviewDueAt: "2027-01-12",
  revision: "wales-2026-10-17-r1",
};
export const walesSectors: CatalogueRequirement["sectors"] = [
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
export function walesSource(input: SourceInput): Source {
  return {
    ...input,
    territory: ["GB-WLS"],
    language: "en",
    retrievedAt: "2026-10-17",
    review: walesReview,
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
export function walesRequirement(
  input: RequirementInput,
): CatalogueRequirement {
  return {
    version: 1,
    jurisdiction: "GB-WLS",
    sectors: walesSectors,
    allowsNotApplicable: false,
    notApplicablePolicy: null,
    effective: { from: "2026-10-17", to: null },
    review: walesReview,
    state: "PUBLISHED",
    materialChangeReason: "Initial reviewed Wales checklist action",
    supersedesVersion: null,
    reviewCadenceDays: 365,
    reviewCadenceBasis:
      "Portal planning reminder; review sooner on material change or source-specific triggers. This interval is not a universal statutory deadline.",
    ...input,
  };
}
