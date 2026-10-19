import type { CatalogueRequirement, TrackerCatalogue } from "../schema";

export const czechiaReview = {
  reviewer: "Codex primary-source and applicability review (automated)",
  verifiedAt: "2026-10-19",
  reviewDueAt: "2027-01-15",
  revision: "Czechia-2026-10-19-r1",
};

export const czechiaSectors: CatalogueRequirement["sectors"] = [
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

export function czechiaSource(input: SourceInput): Source {
  return {
    ...input,
    territory: ["CZ"],
    publishedAt: null,
    publishedDateUnknownReason:
      "Precise publication date of this living guidance or provision was not verified.",
    effective: {
      from: null,
      to: null,
      currentAsOf: "2026-10-19",
      unknownReason:
        "Current official or provider text observed; commencement of every amendment was not reconstructed.",
    },
    retrievedAt: "2026-10-19",
    review: czechiaReview,
    state: "REVIEWED",
    translationProvenance:
      input.language === "en"
        ? null
        : "Codex working English summary of the linked Czech official text; verify operative wording with the competent authority.",
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

export function czechiaRequirement(
  input: RequirementInput,
): CatalogueRequirement {
  return {
    version: 1,
    jurisdiction: "CZ",
    sectors: czechiaSectors,
    allowsNotApplicable: false,
    notApplicablePolicy: null,
    effective: { from: "2026-10-19", to: null },
    review: czechiaReview,
    state: "PUBLISHED",
    materialChangeReason: "Initial reviewed Czechia shared checklist action",
    supersedesVersion: null,
    reviewCadenceDays: 365,
    reviewCadenceBasis:
      "Portal planning reminder; review sooner after a material change or authority instruction. Not a universal statutory deadline.",
    ...input,
  };
}
