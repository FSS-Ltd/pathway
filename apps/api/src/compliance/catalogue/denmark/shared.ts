import type { CatalogueRequirement, TrackerCatalogue } from "../schema";

export const denmarkReview = {
  reviewer: "Codex primary-source and applicability review (automated)",
  verifiedAt: "2026-10-19",
  reviewDueAt: "2026-12-30",
  revision: "Denmark-2026-10-19-r1",
};

export const denmarkSectors: CatalogueRequirement["sectors"] = [
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

export function denmarkSource(input: SourceInput): Source {
  return {
    ...input,
    territory: ["DK"],
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
    review: denmarkReview,
    state: "REVIEWED",
    translationProvenance:
      input.language === "en"
        ? null
        : "Codex working English summary of the linked Danish official text; verify operative wording with the competent authority.",
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

export function denmarkRequirement(
  input: RequirementInput,
): CatalogueRequirement {
  return {
    version: 1,
    jurisdiction: "DK",
    sectors: denmarkSectors,
    allowsNotApplicable: false,
    notApplicablePolicy: null,
    effective: { from: "2026-10-19", to: null },
    review: denmarkReview,
    state: "PUBLISHED",
    materialChangeReason: "Initial reviewed Denmark shared checklist action",
    supersedesVersion: null,
    reviewCadenceDays: 365,
    reviewCadenceBasis:
      "Portal planning reminder; review sooner after a material change or authority instruction. Not a universal statutory deadline.",
    ...input,
  };
}
