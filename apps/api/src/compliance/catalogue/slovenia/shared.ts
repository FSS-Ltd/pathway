import type { CatalogueRequirement, TrackerCatalogue } from "../schema";

export const sloveniaReview = {
  reviewer: "Codex primary-source and applicability review (automated)",
  verifiedAt: "2026-10-20",
  reviewDueAt: "2027-01-18",
  revision: "Slovenia-2026-10-20-r1",
};

export const sloveniaSectors: CatalogueRequirement["sectors"] = [
  "SCHOOL",
  "NURSERY",
  "CHURCH",
  "CHARITY",
  "CLUB",
  "LEARNING_CENTRE",
];

// Eurostat NUTS 2024 level 3 statistical regions, not licensing authorities.
export const sloveniaRegionCodes = [
  "SI031",
  "SI032",
  "SI033",
  "SI034",
  "SI035",
  "SI036",
  "SI037",
  "SI038",
  "SI041",
  "SI042",
  "SI043",
  "SI044",
] as const;

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

export function sloveniaSource(input: SourceInput): Source {
  return {
    ...input,
    territory: ["SI", ...sloveniaRegionCodes],
    publishedAt: null,
    publishedDateUnknownReason:
      "Publication date of the current consolidated text was not verified.",
    effective: {
      from: null,
      to: null,
      currentAsOf: "2026-10-20",
      unknownReason:
        "Current official text observed; commencement of every amendment was not reconstructed.",
    },
    retrievedAt: "2026-10-20",
    review: sloveniaReview,
    state: "REVIEWED",
    translationProvenance:
      input.language === "en"
        ? null
        : "Codex working English summary of Slovenian text; verify operative wording with the competent authority.",
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
      "jurisdiction" | "allowsNotApplicable" | "notApplicablePolicy"
    >
  >;

export function sloveniaRequirement(
  input: RequirementInput,
): CatalogueRequirement {
  return {
    version: 1,
    jurisdiction: "SI",
    sectors: sloveniaSectors,
    allowsNotApplicable: false,
    notApplicablePolicy: null,
    effective: { from: "2026-10-20", to: null },
    review: sloveniaReview,
    state: "PUBLISHED",
    materialChangeReason: "Initial reviewed Slovenia checklist action",
    supersedesVersion: null,
    reviewCadenceDays: 365,
    reviewCadenceBasis:
      "Portal planning reminder, not a universal statutory deadline; review sooner after a material change or authority instruction.",
    ...input,
  };
}

export const children = { field: "minimumAge", op: "lte", value: 17 } as const;
export const school: NonNullable<CatalogueRequirement["condition"]> = {
  any: [
    { field: "providerCategory", op: "eq", value: "INDEPENDENT_SCHOOL" },
    { field: "providerCategory", op: "eq", value: "STATE_SCHOOL" },
  ],
};
export const earlyYears: NonNullable<CatalogueRequirement["condition"]> = {
  any: [
    { field: "providerCategory", op: "eq", value: "EARLY_YEARS" },
    { field: "providerCategory", op: "eq", value: "CHILDCARE" },
  ],
};
