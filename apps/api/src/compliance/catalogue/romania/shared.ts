import type { CatalogueRequirement, TrackerCatalogue } from "../schema";

export const romaniaReview = {
  reviewer: "Codex primary-source and applicability review (automated)",
  verifiedAt: "2026-10-20",
  reviewDueAt: "2027-01-18",
  revision: "Romania-2026-10-20-r1",
};

export const romaniaSectors: CatalogueRequirement["sectors"] = [
  "SCHOOL",
  "NURSERY",
  "CHURCH",
  "CHARITY",
  "CLUB",
  "LEARNING_CENTRE",
];

export const romaniaCountyCodes = [
  "RO111",
  "RO112",
  "RO113",
  "RO114",
  "RO115",
  "RO116",
  "RO121",
  "RO122",
  "RO123",
  "RO124",
  "RO125",
  "RO126",
  "RO211",
  "RO212",
  "RO213",
  "RO214",
  "RO215",
  "RO216",
  "RO221",
  "RO222",
  "RO223",
  "RO224",
  "RO225",
  "RO226",
  "RO311",
  "RO312",
  "RO313",
  "RO314",
  "RO315",
  "RO316",
  "RO317",
  "RO321",
  "RO322",
  "RO411",
  "RO412",
  "RO413",
  "RO414",
  "RO415",
  "RO421",
  "RO422",
  "RO423",
  "RO424",
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
  Partial<Pick<Source, "publishedAt" | "territory">> & {
    effectiveFrom?: string;
  };

export function romaniaSource(input: SourceInput): Source {
  return {
    id: input.id,
    url: input.url,
    title: input.title,
    authority: input.authority,
    provision: input.provision,
    classification: input.classification,
    language: input.language,
    territory: input.territory ?? ["RO", ...romaniaCountyCodes],
    publishedAt: input.publishedAt ?? null,
    publishedDateUnknownReason: input.publishedAt
      ? null
      : "Precise publication date of the consolidated text was not verified.",
    effective: {
      from: input.effectiveFrom ?? null,
      to: null,
      currentAsOf: "2026-10-20",
      unknownReason: input.effectiveFrom
        ? null
        : "Current official text observed; commencement of every amendment was not reconstructed.",
    },
    retrievedAt: "2026-10-20",
    review: romaniaReview,
    state: "REVIEWED",
    translationProvenance:
      input.language === "en"
        ? null
        : "Codex working English summary of Romanian text; verify operative wording with the competent authority.",
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
    >
  >;

export function romaniaRequirement(
  input: RequirementInput,
): CatalogueRequirement {
  return {
    version: 1,
    jurisdiction: "RO",
    sectors: romaniaSectors,
    allowsNotApplicable: false,
    notApplicablePolicy: null,
    effective: { from: "2026-10-20", to: null },
    review: romaniaReview,
    state: "PUBLISHED",
    materialChangeReason: "Initial reviewed Romania checklist action",
    supersedesVersion: null,
    reviewCadenceDays: 365,
    reviewCadenceBasis:
      "Portal planning reminder, not a universal statutory deadline; review sooner after a material change or authority instruction.",
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
export const school: NonNullable<CatalogueRequirement["condition"]> = {
  any: [independentSchool, stateSchool],
};
export const antePreschool: NonNullable<CatalogueRequirement["condition"]> = {
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
export const earlyYears: NonNullable<CatalogueRequirement["condition"]> = {
  any: [
    antePreschool,
    { field: "providerCategory", op: "eq", value: "EARLY_YEARS" },
  ],
};
