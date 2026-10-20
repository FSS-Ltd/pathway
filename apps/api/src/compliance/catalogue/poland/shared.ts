import type { CatalogueRequirement, TrackerCatalogue } from "../schema";

export const polandReview = {
  reviewer: "Codex primary-source and applicability review (automated)",
  verifiedAt: "2026-10-20",
  reviewDueAt: "2027-01-18",
  revision: "Poland-2026-10-20-r1",
};

export const polandSectors: CatalogueRequirement["sectors"] = [
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
> &
  Partial<Pick<Source, "publishedAt">> & { effectiveFrom?: string };

export function polandSource(input: SourceInput): Source {
  return {
    id: input.id,
    url: input.url,
    title: input.title,
    authority: input.authority,
    provision: input.provision,
    classification: input.classification,
    language: input.language,
    territory: ["PL"],
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
    review: polandReview,
    state: "REVIEWED",
    translationProvenance:
      input.language === "en"
        ? null
        : "Codex working English summary of Polish text; verify operative legal wording with the competent authority.",
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

export function polandRequirement(
  input: RequirementInput,
): CatalogueRequirement {
  return {
    version: 1,
    jurisdiction: "PL",
    sectors: polandSectors,
    allowsNotApplicable: false,
    notApplicablePolicy: null,
    effective: { from: "2026-10-20", to: null },
    review: polandReview,
    state: "PUBLISHED",
    materialChangeReason: "Initial reviewed Poland shared checklist action",
    supersedesVersion: null,
    reviewCadenceDays: 365,
    reviewCadenceBasis:
      "Portal planning reminder; review sooner after a material change or authority instruction. Not a universal statutory deadline.",
    ...input,
  };
}

export const children = { field: "minimumAge", op: "lte", value: 17 } as const;
export const independentSchool = {
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
  any: [independentSchool, publicSchool],
};
export const underThreeCare: NonNullable<CatalogueRequirement["condition"]> = {
  any: [
    { field: "providerCategory", op: "eq", value: "CHILDCARE" },
    { field: "childcare", op: "eq", value: true },
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
