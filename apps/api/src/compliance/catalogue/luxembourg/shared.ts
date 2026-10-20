import type { CatalogueRequirement, TrackerCatalogue } from "../schema";
import { luxembourgCommuneCodes } from "./locations";

export const luxembourgReview = {
  reviewer: "Codex primary-source and applicability review (automated)",
  verifiedAt: "2026-10-20",
  reviewDueAt: "2027-01-18",
  revision: "Luxembourg-2026-10-20-r1",
};

export const luxembourgSectors: CatalogueRequirement["sectors"] = [
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
  Partial<Pick<Source, "publishedAt">>;

export function luxembourgSource(input: SourceInput): Source {
  return {
    ...input,
    territory: ["LU"],
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
    review: luxembourgReview,
    state: "REVIEWED",
    translationProvenance:
      input.language === "en"
        ? null
        : "Codex working English summary of the operative French text; verify legal wording with the competent authority.",
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

export function luxembourgRequirement(
  input: RequirementInput,
): CatalogueRequirement {
  return {
    version: 1,
    jurisdiction: "LU",
    sectors: luxembourgSectors,
    allowsNotApplicable: false,
    notApplicablePolicy: null,
    effective: { from: "2026-10-20", to: null },
    review: luxembourgReview,
    state: "PUBLISHED",
    materialChangeReason: "Initial reviewed Luxembourg shared checklist action",
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
export const stateSchool = {
  field: "providerCategory",
  op: "eq",
  value: "STATE_SCHOOL",
} as const;
export const formalSchool: NonNullable<CatalogueRequirement["condition"]> = {
  any: [independentSchool, stateSchool],
};
export const childCare: NonNullable<CatalogueRequirement["condition"]> = {
  any: [
    { field: "providerCategory", op: "eq", value: "EARLY_YEARS" },
    { field: "providerCategory", op: "eq", value: "CHILDCARE" },
    { field: "childcare", op: "eq", value: true },
  ],
};
export const outOfSchool = {
  field: "providerCategory",
  op: "eq",
  value: "OUT_OF_SCHOOL",
} as const;
export const commune: NonNullable<CatalogueRequirement["condition"]> = {
  any: luxembourgCommuneCodes.map((code) => ({
    field: "subdivisionCode" as const,
    op: "eq" as const,
    value: `LU-LAU2-${code}`,
  })),
};
