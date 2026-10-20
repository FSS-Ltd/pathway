import type { CatalogueRequirement, TrackerCatalogue } from "../schema";

export const italyReview = {
  reviewer: "Codex primary-source and applicability review (automated)",
  verifiedAt: "2026-10-20",
  reviewDueAt: "2027-01-18",
  revision: "Italy-2026-10-20-r1",
};

export const italySectors: CatalogueRequirement["sectors"] = [
  "SCHOOL",
  "NURSERY",
  "CHURCH",
  "CHARITY",
  "CLUB",
  "LEARNING_CENTRE",
];

export const italyRegionCodes = [
  "65",
  "77",
  "78",
  "72",
  "45",
  "36",
  "62",
  "42",
  "25",
  "57",
  "67",
  "21",
  "75",
  "88",
  "82",
  "52",
  "32",
  "55",
  "23",
  "34",
  "TN",
  "BZ",
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
> &
  Partial<Pick<Source, "publishedAt">>;

export function italySource(input: SourceInput): Source {
  return {
    ...input,
    territory: ["IT"],
    publishedAt: input.publishedAt ?? null,
    publishedDateUnknownReason: input.publishedAt
      ? null
      : "Precise publication date of this living guidance or consolidated provision was not verified.",
    effective: {
      from: null,
      to: null,
      currentAsOf: "2026-10-20",
      unknownReason:
        "Current official or provider text observed; commencement of every amendment was not reconstructed.",
    },
    retrievedAt: "2026-10-20",
    review: italyReview,
    state: "REVIEWED",
    translationProvenance:
      input.language === "en"
        ? null
        : "Codex working English summary of the linked Italian official text; verify operative wording with the competent authority.",
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

export function italyRequirement(
  input: RequirementInput,
): CatalogueRequirement {
  return {
    version: 1,
    jurisdiction: "IT",
    sectors: italySectors,
    allowsNotApplicable: false,
    notApplicablePolicy: null,
    effective: { from: "2026-10-20", to: null },
    review: italyReview,
    state: "PUBLISHED",
    materialChangeReason: "Initial reviewed Italy shared checklist action",
    supersedesVersion: null,
    reviewCadenceDays: 365,
    reviewCadenceBasis:
      "Portal planning reminder; review sooner after a material change or authority instruction. Not a universal statutory deadline.",
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
export const nonStateSchool = {
  field: "providerCategory",
  op: "eq",
  value: "INDEPENDENT_SCHOOL",
} as const;
export const outOfSchool = {
  field: "providerCategory",
  op: "eq",
  value: "OUT_OF_SCHOOL",
} as const;
export const care: NonNullable<CatalogueRequirement["condition"]> = {
  any: [
    { field: "providerCategory", op: "eq", value: "EARLY_YEARS" },
    { field: "providerCategory", op: "eq", value: "CHILDCARE" },
    { field: "childcare", op: "eq", value: true },
  ],
};
export const region: NonNullable<CatalogueRequirement["condition"]> = {
  any: italyRegionCodes.map((code) => ({
    field: "subdivisionCode" as const,
    op: "eq" as const,
    value: `IT-${code}`,
  })),
};
