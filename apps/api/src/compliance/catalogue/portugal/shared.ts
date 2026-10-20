import type { CatalogueRequirement, TrackerCatalogue } from "../schema";

export const portugalReview = {
  reviewer: "Codex primary-source and applicability review (automated)",
  verifiedAt: "2026-10-20",
  reviewDueAt: "2027-01-18",
  revision: "Portugal-2026-10-20-r1",
};

export const portugalSectors: CatalogueRequirement["sectors"] = [
  "SCHOOL",
  "NURSERY",
  "CHURCH",
  "CHARITY",
  "CLUB",
  "LEARNING_CENTRE",
];

export const mainlandDistrictCodes = Array.from(
  { length: 18 },
  (_, index) => `PT-D${String(index + 1).padStart(2, "0")}`,
);

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
  Partial<Pick<Source, "publishedAt" | "territory">> & {
    effectiveFrom?: string;
  };

export function portugalSource(input: SourceInput): Source {
  return {
    id: input.id,
    url: input.url,
    title: input.title,
    authority: input.authority,
    provision: input.provision,
    classification: input.classification,
    language: input.language,
    territory: input.territory ?? [
      "PT",
      ...mainlandDistrictCodes,
      "PT-AZO",
      "PT-MAD",
    ],
    publishedAt: input.publishedAt ?? null,
    publishedDateUnknownReason: input.publishedAt
      ? null
      : "Precise publication date of this living guidance or consolidated provision was not verified.",
    effective: {
      from: input.effectiveFrom ?? null,
      to: null,
      currentAsOf: "2026-10-20",
      unknownReason: input.effectiveFrom
        ? null
        : "Current official or provider text observed; commencement of every amendment was not reconstructed.",
    },
    retrievedAt: "2026-10-20",
    review: portugalReview,
    state: "REVIEWED",
    translationProvenance:
      input.language === "en"
        ? null
        : "Codex working English summary of Portuguese text; verify operative wording with the competent authority.",
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
      | "jurisdiction"
      | "allowsNotApplicable"
      | "notApplicablePolicy"
      | "reviewCadenceDays"
      | "reviewCadenceBasis"
    >
  >;

export function portugalRequirement(
  input: RequirementInput,
): CatalogueRequirement {
  return {
    version: 1,
    jurisdiction: "PT",
    sectors: portugalSectors,
    allowsNotApplicable: false,
    notApplicablePolicy: null,
    effective: { from: "2026-10-20", to: null },
    review: portugalReview,
    state: "PUBLISHED",
    materialChangeReason: "Initial reviewed Portugal checklist action",
    supersedesVersion: null,
    reviewCadenceDays: 365,
    reviewCadenceBasis:
      "Portal planning reminder; review sooner after a material change or authority instruction. Not a universal statutory deadline.",
    ...input,
  };
}

export const children = { field: "minimumAge", op: "lte", value: 17 } as const;
export const privateSchool = {
  field: "providerCategory",
  op: "eq",
  value: "INDEPENDENT_SCHOOL",
} as const;
export const publicSchool = {
  field: "providerCategory",
  op: "eq",
  value: "STATE_SCHOOL",
} as const;
export const formalSchool: NonNullable<CatalogueRequirement["condition"]> = {
  any: [privateSchool, publicSchool],
};
export const creche: NonNullable<CatalogueRequirement["condition"]> = {
  all: [
    {
      any: [
        { field: "providerCategory", op: "eq", value: "CHILDCARE" },
        { field: "childcare", op: "eq", value: true },
      ],
    },
    { field: "minimumAge", op: "lte", value: 3 },
  ],
};
export const preschool = {
  field: "providerCategory",
  op: "eq",
  value: "EARLY_YEARS",
} as const;
export const outOfSchool = {
  field: "providerCategory",
  op: "eq",
  value: "OUT_OF_SCHOOL",
} as const;
