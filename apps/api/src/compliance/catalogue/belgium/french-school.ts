import type { CatalogueRequirement, TrackerCatalogue } from "../schema";
import type { Condition } from "../conditions";
import { belgiumRequirement, belgiumSource } from "./shared";

export const belgiumFrenchSchoolReview = {
  reviewer: "Codex primary-source and applicability review (automated)",
  verifiedAt: "2026-10-21",
  reviewDueAt: "2027-01-15",
  revision: "belgium-french-school-2026-10-21-r1",
};

const territory = ["BE", "BE-FRENCH-COMMUNITY", "BE1", "BE3"];
const codeUrl = "https://refli.be/fr/lex/2019A30854";

export const belgiumFrenchSchoolSources: TrackerCatalogue["sources"] = [
  {
    ...belgiumSource({
      id: "bel-french-school-code",
      url: codeUrl,
      title:
        "Code de l'enseignement fondamental et de l'enseignement secondaire",
      authority: "French Community of Belgium",
      provision:
        "Articles 1.3.1-1 (school network definitions), 1.5.1-2 and 1.5.1-5 (education, pedagogy and school projects), 1.7.1-10 (attendance registers and unjustified-absence reporting), and 1.7.1-12 (home-education declaration by responsible adults, with optional delegation to a non-network school's director).",
      classification: "LEGISLATION",
      language: "fr",
    }),
    territory,
    publishedAt: "2019-09-19",
    publishedDateUnknownReason: null,
    retrievedAt: belgiumFrenchSchoolReview.verifiedAt,
    review: belgiumFrenchSchoolReview,
    effective: {
      from: null,
      to: null,
      currentAsOf: belgiumFrenchSchoolReview.verifiedAt,
      unknownReason:
        "The consolidated Code includes 2026 amendments; commencement differs by provision. The attendance rule took effect on 25 August 2025, and the other cited provisions were verified in the current consolidation.",
    },
  },
  {
    ...belgiumSource({
      id: "bel-compulsory-age",
      url: "https://www.belgium.be/fr/formation/enseignement/droits_et_devoirs/obligation_scolaire",
      title: "Compulsory education",
      authority: "Belgian federal government",
      provision:
        "Compulsory education starts in the year the child turns five and ends at the age of 18; full-time and part-time routes differ by age.",
      classification: "GUIDANCE",
      language: "fr",
    }),
    territory: ["BE"],
    retrievedAt: belgiumFrenchSchoolReview.verifiedAt,
    review: belgiumFrenchSchoolReview,
    effective: {
      from: null,
      to: null,
      currentAsOf: belgiumFrenchSchoolReview.verifiedAt,
      unknownReason:
        "Living government guidance verified; commencement of every age-rule amendment was not reconstructed.",
    },
  },
];

const school: Condition = {
  any: [
    { field: "providerCategory", op: "eq", value: "INDEPENDENT_SCHOOL" },
    { field: "providerCategory", op: "eq", value: "STATE_SCHOOL" },
  ],
};
const region: Condition = {
  any: [
    { field: "subdivisionCode", op: "eq", value: "BE1" },
    { field: "subdivisionCode", op: "eq", value: "BE3" },
  ],
};
const community: Condition = {
  field: "belgianEducationCommunity",
  op: "eq",
  value: "FRENCH",
};
const inNetwork: Condition = {
  any: [
    { field: "belgianFrenchSchoolRoute", op: "eq", value: "FWB_ORGANISED" },
    { field: "belgianFrenchSchoolRoute", op: "eq", value: "FWB_SUBSIDISED" },
  ],
};

export const belgiumFrenchSchoolRequirements: CatalogueRequirement[] = [
  {
    ...belgiumRequirement({
      id: "bel.french-school-project",
      topic: "education_childcare",
      obligationClass: "STATUTORY_DUTY",
      condition: { all: [community, school, region, inNetwork] },
      action:
        "Maintain the school's project and the organising body's educational and pedagogical projects for its French Community provision.",
      applicabilityExplanation:
        "Applies to an actual school organised by WBE or subsidised by the French Community in Brussels or Wallonia. The school's project must describe its educational priorities and concrete actions; the organising body maintains its educational and pedagogical projects.",
      unknownExplanation:
        "Confirm the school's education Community, organised or subsidised route, provider category and operating Region with the competent authority.",
      expectedEvidence: [
        "Current school project and recorded review or adoption",
        "Organising body's educational and pedagogical projects",
      ],
      sourceIds: ["bel-french-school-code"],
      signalKeys: [],
    }),
    effective: { from: belgiumFrenchSchoolReview.verifiedAt, to: null },
    review: belgiumFrenchSchoolReview,
    materialChangeReason:
      "Initial reviewed French Community school-project action",
  },
  {
    ...belgiumRequirement({
      id: "bel.french-school-attendance",
      topic: "education_childcare",
      obligationClass: "STATUTORY_DUTY",
      condition: { all: [community, school, region, inNetwork] },
      action:
        "Maintain attendance registers and report unjustified absences through the French Community's required process.",
      applicabilityExplanation:
        "Article 1.7.1-10 applies to organised or subsidised nursery, primary, fundamental and secondary schools, including ordinary and specialised provision. Portal attendance records are supporting evidence, not proof that the government system was updated.",
      unknownExplanation:
        "Confirm the school's organised or subsidised route and the current government attendance process with the French Community.",
      expectedEvidence: [
        "Attendance register and absence-coding procedure",
        "Evidence of required reporting to the French Community's system",
      ],
      sourceIds: ["bel-french-school-code"],
      signalKeys: ["attendance"],
    }),
    effective: { from: belgiumFrenchSchoolReview.verifiedAt, to: null },
    review: belgiumFrenchSchoolReview,
    materialChangeReason: "Initial reviewed French Community attendance action",
  },
  {
    ...belgiumRequirement({
      id: "bel.french-outside-network-family-declaration",
      topic: "education_childcare",
      obligationClass: "RECOMMENDATION",
      condition: {
        all: [
          community,
          school,
          region,
          {
            field: "belgianFrenchSchoolRoute",
            op: "eq",
            value: "OUTSIDE_FWB_NETWORK",
          },
          { field: "minimumAge", op: "lte", value: 17 },
          { field: "maximumAge", op: "gte", value: 5 },
        ],
      },
      action:
        "Explain the home-education declaration route to families of compulsory-age children and record who will submit each declaration.",
      applicabilityExplanation:
        "For children educated in a school neither organised nor subsidised by the French Community, the responsible adults must make the annual home-education declaration. They may delegate submission to the school's director under their own responsibility. This checklist action is a provider recommendation, not a statutory duty placed on every school.",
      unknownExplanation:
        "Confirm the school's network route, ages served and each family's declaration arrangements with the French Community; do not assume attendance at a private school satisfies the declaration requirement.",
      expectedEvidence: [
        "Family-facing explanation of the official declaration route and current deadline",
        "Recorded agreement on whether the family or director submits the declaration, without exposing child details in the tracker",
      ],
      sourceIds: ["bel-french-school-code", "bel-compulsory-age"],
      signalKeys: [],
    }),
    effective: { from: belgiumFrenchSchoolReview.verifiedAt, to: null },
    review: belgiumFrenchSchoolReview,
    materialChangeReason:
      "Initial reviewed outside-network family-declaration recommendation",
  },
];
