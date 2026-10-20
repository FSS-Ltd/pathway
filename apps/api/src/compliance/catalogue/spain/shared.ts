import type { CatalogueRequirement, TrackerCatalogue } from "../schema";

export const spainReview = {
  reviewer: "Codex primary-source and applicability review (automated)",
  verifiedAt: "2026-10-20",
  reviewDueAt: "2027-01-18",
  revision: "Spain-2026-10-20-r1",
};

export const spainSectors: CatalogueRequirement["sectors"] = [
  "SCHOOL",
  "NURSERY",
  "CHURCH",
  "CHARITY",
  "CLUB",
  "LEARNING_CENTRE",
];

// Eurostat NUTS 2024 level 2: 17 autonomous communities and Ceuta/Melilla.
// Codes identify territory; they do not grant education or childcare permission.
export const spainRegionCodes = [
  "ES11",
  "ES12",
  "ES13",
  "ES21",
  "ES22",
  "ES23",
  "ES24",
  "ES30",
  "ES41",
  "ES42",
  "ES43",
  "ES51",
  "ES52",
  "ES53",
  "ES61",
  "ES62",
  "ES63",
  "ES64",
  "ES70",
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

export function spainSource(input: SourceInput): Source {
  return {
    ...input,
    territory: ["ES", ...spainRegionCodes],
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
    review: spainReview,
    state: "REVIEWED",
    translationProvenance:
      input.language === "en"
        ? null
        : "Codex working English summary of Spanish text; verify operative wording with the competent authority.",
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

export function spainRequirement(
  input: RequirementInput,
): CatalogueRequirement {
  return {
    version: 1,
    jurisdiction: "ES",
    sectors: spainSectors,
    allowsNotApplicable: false,
    notApplicablePolicy: null,
    effective: { from: "2026-10-20", to: null },
    review: spainReview,
    state: "PUBLISHED",
    materialChangeReason: "Initial reviewed Spain checklist action",
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
