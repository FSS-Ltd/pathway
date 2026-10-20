import type { CatalogueRequirement, TrackerCatalogue } from "../schema";

export const latviaReview = {
  reviewer: "Codex primary-source and applicability review (automated)",
  verifiedAt: "2026-10-20",
  reviewDueAt: "2027-01-18",
  revision: "Latvia-2026-10-20-r1",
};

export const latviaSectors: CatalogueRequirement["sectors"] = [
  "SCHOOL",
  "NURSERY",
  "CHURCH",
  "CHARITY",
  "CLUB",
  "LEARNING_CENTRE",
];

/** Current top-level ATVK codes, matching migration 20261110000000. */
export const latviaAuthorityCodes = [
  "0001000",
  "0002000",
  "0003000",
  "0004000",
  "0005000",
  "0006000",
  "0007000",
  "0020000",
  "0021000",
  "0022000",
  "0023000",
  "0024000",
  "0025000",
  "0026000",
  "0027000",
  "0028000",
  "0029000",
  "0030000",
  "0031000",
  "0032000",
  "0033000",
  "0034000",
  "0035000",
  "0036000",
  "0037000",
  "0038001",
  "0039000",
  "0040000",
  "0041000",
  "0042000",
  "0043000",
  "0044000",
  "0045000",
  "0046000",
  "0047000",
  "0048000",
  "0049000",
  "0051000",
  "0052000",
  "0053000",
  "0054000",
  "0056000",
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

export function latviaSource(input: SourceInput): Source {
  return {
    ...input,
    territory: ["LV"],
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
    review: latviaReview,
    state: "REVIEWED",
    translationProvenance:
      input.language === "en"
        ? null
        : "Codex working English summary of the operative Latvian text; verify legal wording with the competent authority.",
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

export function latviaRequirement(
  input: RequirementInput,
): CatalogueRequirement {
  return {
    version: 1,
    jurisdiction: "LV",
    sectors: latviaSectors,
    allowsNotApplicable: false,
    notApplicablePolicy: null,
    effective: { from: "2026-10-20", to: null },
    review: latviaReview,
    state: "PUBLISHED",
    materialChangeReason: "Initial reviewed Latvia shared checklist action",
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
export const formalEducation: NonNullable<CatalogueRequirement["condition"]> = {
  any: [school, { field: "providerCategory", op: "eq", value: "EARLY_YEARS" }],
};
export const care: NonNullable<CatalogueRequirement["condition"]> = {
  any: [
    { field: "providerCategory", op: "eq", value: "EARLY_YEARS" },
    { field: "providerCategory", op: "eq", value: "CHILDCARE" },
    { field: "childcare", op: "eq", value: true },
  ],
};
export const municipality: NonNullable<CatalogueRequirement["condition"]> = {
  any: latviaAuthorityCodes.map((code) => ({
    field: "subdivisionCode" as const,
    op: "eq" as const,
    value: `LV-ATVK-${code}`,
  })),
};
