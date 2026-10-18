import type { CatalogueRequirement, TrackerCatalogue } from "../schema";

export const irelandReview = {
  reviewer: "Codex primary-source and applicability review (automated)",
  verifiedAt: "2026-10-18",
  reviewDueAt: "2027-01-12",
  revision: "ireland-2026-10-18-r1",
};

export const irelandSectors: CatalogueRequirement["sectors"] = [
  "SCHOOL",
  "NURSERY",
  "CHURCH",
  "CHARITY",
  "CLUB",
  "LEARNING_CENTRE",
];

export const irelandCareCondition: CatalogueRequirement["condition"] = {
  any: [
    { field: "providerCategory", op: "eq", value: "CHILDCARE" },
    { field: "providerCategory", op: "eq", value: "EARLY_YEARS" },
    { field: "childcare", op: "eq", value: true },
  ],
};

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

export function irelandSource(input: SourceInput): Source {
  return {
    ...input,
    territory: ["IE"],
    language: "en",
    retrievedAt: "2026-10-18",
    review: irelandReview,
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

export function irelandRequirement(
  input: RequirementInput,
): CatalogueRequirement {
  return {
    version: 1,
    jurisdiction: "IE",
    sectors: irelandSectors,
    allowsNotApplicable: false,
    notApplicablePolicy: null,
    effective: { from: "2026-10-18", to: null },
    review: irelandReview,
    state: "PUBLISHED",
    materialChangeReason: "Initial reviewed Ireland checklist action",
    supersedesVersion: null,
    reviewCadenceDays: 365,
    reviewCadenceBasis:
      "Portal planning reminder; review sooner after material change or a source-specific trigger. This is not a universal statutory deadline.",
    ...input,
  };
}
