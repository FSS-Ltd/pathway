import type { CatalogueRequirement, TrackerCatalogue } from "../schema";

export const bulgariaReview = {
  reviewer: "Codex primary-source and applicability review (automated)",
  verifiedAt: "2026-10-18",
  reviewDueAt: "2027-01-15",
  revision: "bulgaria-2026-10-18-r1",
};

export const bulgariaSectors: CatalogueRequirement["sectors"] = [
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
>;

export function bulgariaSource(input: SourceInput): Source {
  return {
    ...input,
    territory: ["BG"],
    publishedAt: null,
    publishedDateUnknownReason:
      "Precise publication date of this living guidance or provision was not verified.",
    effective: {
      from: null,
      to: null,
      currentAsOf: "2026-10-18",
      unknownReason:
        "Current official or provider text observed; commencement of every amendment was not reconstructed.",
    },
    retrievedAt: "2026-10-18",
    review: bulgariaReview,
    state: "REVIEWED",
    translationProvenance:
      input.language === "en"
        ? null
        : "Codex working English summary of the linked official text; verify operative wording with the competent authority.",
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

export function bulgariaRequirement(
  input: RequirementInput,
): CatalogueRequirement {
  return {
    version: 1,
    jurisdiction: "BG",
    sectors: bulgariaSectors,
    allowsNotApplicable: false,
    notApplicablePolicy: null,
    effective: { from: "2026-10-18", to: null },
    review: bulgariaReview,
    state: "PUBLISHED",
    materialChangeReason: "Initial reviewed Bulgaria shared checklist action",
    supersedesVersion: null,
    reviewCadenceDays: 365,
    reviewCadenceBasis:
      "Portal planning reminder; review sooner after a material change or authority instruction. Not a universal statutory deadline.",
    ...input,
  };
}
