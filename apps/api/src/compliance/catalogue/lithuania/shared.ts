import type { CatalogueRequirement, TrackerCatalogue } from "../schema";
import { lithuaniaMunicipalityCodes } from "./locations";

export const lithuaniaReview = {
  reviewer: "Codex primary-source and applicability review (automated)",
  verifiedAt: "2026-10-20",
  reviewDueAt: "2027-01-18",
  revision: "Lithuania-2026-10-20-r1",
};

export const lithuaniaSectors: CatalogueRequirement["sectors"] = [
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

export function lithuaniaSource(input: SourceInput): Source {
  return {
    ...input,
    territory: ["LT"],
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
    review: lithuaniaReview,
    state: "REVIEWED",
    translationProvenance:
      input.language === "en"
        ? null
        : "Codex working English summary of the operative Lithuanian text; verify legal wording with the competent authority.",
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

export function lithuaniaRequirement(
  input: RequirementInput,
): CatalogueRequirement {
  return {
    version: 1,
    jurisdiction: "LT",
    sectors: lithuaniaSectors,
    allowsNotApplicable: false,
    notApplicablePolicy: null,
    effective: { from: "2026-10-20", to: null },
    review: lithuaniaReview,
    state: "PUBLISHED",
    materialChangeReason: "Initial reviewed Lithuania shared checklist action",
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
export const preschool = {
  field: "providerCategory",
  op: "eq",
  value: "EARLY_YEARS",
} as const;
export const formalEducation: NonNullable<CatalogueRequirement["condition"]> = {
  any: [school, preschool],
};
export const interestEducation = {
  field: "providerCategory",
  op: "eq",
  value: "OUT_OF_SCHOOL",
} as const;
export const municipality: NonNullable<CatalogueRequirement["condition"]> = {
  any: lithuaniaMunicipalityCodes.map((code) => ({
    field: "subdivisionCode" as const,
    op: "eq" as const,
    value: `LT-SAV-${code}`,
  })),
};

/** 2026/27 first-wave CPIS municipalities named by the Ministry. */
export const firstWaveAdmissionsMunicipalities = [
  "15",
  "25",
  "32",
  "34",
  "36",
  "38",
  "42",
  "47",
  "54",
  "57",
  "59",
  "62",
  "65",
  "66",
  "67",
  "69",
  "72",
  "73",
  "77",
  "79",
  "84",
  "86",
  "87",
  "94",
] as const;
export const firstWaveAdmissions: NonNullable<
  CatalogueRequirement["condition"]
> = {
  any: firstWaveAdmissionsMunicipalities.map((code) => ({
    field: "subdivisionCode" as const,
    op: "eq" as const,
    value: `LT-SAV-${code}`,
  })),
};
