import type { CatalogueRequirement, TrackerCatalogue } from "../schema";

export const austriaReview = {
  reviewer: "Codex primary-source and applicability review (automated)",
  verifiedAt: "2026-10-18",
  reviewDueAt: "2026-12-30",
  revision: "austria-2026-10-18-r1",
};

export const austriaSectors: CatalogueRequirement["sectors"] = [
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
  | "language"
  | "publishedAt"
  | "publishedDateUnknownReason"
  | "effective"
>;

export function austriaSource(input: SourceInput): Source {
  return {
    ...input,
    territory: ["AT"],
    retrievedAt: "2026-10-18",
    review: austriaReview,
    state: "REVIEWED",
    translationProvenance:
      input.language === "de"
        ? "Codex working English summary of the linked German official text; verify operative wording with the authority."
        : null,
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

export function austriaRequirement(
  input: RequirementInput,
): CatalogueRequirement {
  return {
    version: 1,
    jurisdiction: "AT",
    sectors: austriaSectors,
    allowsNotApplicable: false,
    notApplicablePolicy: null,
    effective: { from: "2026-10-18", to: null },
    review: austriaReview,
    state: "PUBLISHED",
    materialChangeReason: "Initial reviewed Austria national checklist action",
    supersedesVersion: null,
    reviewCadenceDays: 365,
    reviewCadenceBasis:
      "Portal planning reminder; review sooner after a material change or source-specific trigger. Not a universal statutory deadline.",
    ...input,
  };
}
