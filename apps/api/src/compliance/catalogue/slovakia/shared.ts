import type { CatalogueRequirement, TrackerCatalogue } from "../schema";

export const slovakiaReview = {
  reviewer: "Codex primary-source and applicability review (automated)",
  verifiedAt: "2026-10-20",
  reviewDueAt: "2027-01-18",
  revision: "Slovakia-2026-10-20-r1",
};

export const slovakiaSectors: CatalogueRequirement["sectors"] = [
  "SCHOOL",
  "NURSERY",
  "CHURCH",
  "CHARITY",
  "CLUB",
  "LEARNING_CENTRE",
];

// Eurostat NUTS 2024 level 3: Slovakia's eight kraje.
export const slovakiaRegionCodes = [
  "SK010",
  "SK021",
  "SK022",
  "SK023",
  "SK031",
  "SK032",
  "SK041",
  "SK042",
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
> & { effectiveFrom?: string };

export function slovakiaSource(input: SourceInput): Source {
  const { effectiveFrom, ...source } = input;
  return {
    ...source,
    territory: ["SK", ...slovakiaRegionCodes],
    publishedAt: null,
    publishedDateUnknownReason:
      "Precise publication date of the current consolidated text was not verified.",
    effective: {
      from: effectiveFrom ?? null,
      to: null,
      currentAsOf: "2026-10-20",
      unknownReason: effectiveFrom
        ? null
        : "Current official text observed; commencement of every amendment was not reconstructed.",
    },
    retrievedAt: "2026-10-20",
    review: slovakiaReview,
    state: "REVIEWED",
    translationProvenance:
      input.language === "en"
        ? null
        : "Codex working English summary of Slovak text; verify operative wording with the competent authority.",
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

export function slovakiaRequirement(
  input: RequirementInput,
): CatalogueRequirement {
  return {
    version: 1,
    jurisdiction: "SK",
    sectors: slovakiaSectors,
    allowsNotApplicable: false,
    notApplicablePolicy: null,
    effective: { from: "2026-10-20", to: null },
    review: slovakiaReview,
    state: "PUBLISHED",
    materialChangeReason: "Initial reviewed Slovakia checklist action",
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
