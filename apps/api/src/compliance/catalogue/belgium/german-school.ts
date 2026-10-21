import type { Condition } from "../conditions";
import type { CatalogueRequirement, TrackerCatalogue } from "../schema";
import { belgiumRequirement, belgiumSource } from "./shared";

export const belgiumGermanSchoolReview = {
  reviewer: "Codex primary-source and applicability review (automated)",
  verifiedAt: "2026-10-21",
  reviewDueAt: "2027-01-15",
  revision: "belgium-german-school-2026-10-21-r1",
};

export const belgiumGermanSchoolSources: TrackerCatalogue["sources"] = [
  {
    ...belgiumSource({
      id: "bel-german-school-decree",
      url: "https://refli.be/fr/lex/1998037687",
      title:
        "Decree of 31 August 1998 on school organising bodies, personnel and pedagogical organisation",
      authority: "German-speaking Community of Belgium",
      provision:
        "Articles 1 (organised/subsidised ordinary and specialised school scope), 20 (school project), 28 (cooperation with enrolment and attendance controls), and 40–41 (school regulations and acknowledgement).",
      classification: "LEGISLATION",
      language: "fr",
    }),
    territory: ["BE", "BE-GERMAN-SPEAKING-COMMUNITY", "BE3"],
    publishedAt: "1998-11-24",
    publishedDateUnknownReason: null,
    retrievedAt: belgiumGermanSchoolReview.verifiedAt,
    review: belgiumGermanSchoolReview,
    effective: {
      from: null,
      to: null,
      currentAsOf: belgiumGermanSchoolReview.verifiedAt,
      unknownReason:
        "The consolidated decree has provision-specific amendments; cited current provisions were verified, but each amendment's commencement was not reconstructed.",
    },
  },
];

const school: Condition = {
  any: [
    { field: "providerCategory", op: "eq", value: "INDEPENDENT_SCHOOL" },
    { field: "providerCategory", op: "eq", value: "STATE_SCHOOL" },
  ],
};
const inScope: Condition = {
  all: [
    { field: "belgianEducationCommunity", op: "eq", value: "GERMAN_SPEAKING" },
    { field: "subdivisionCode", op: "eq", value: "BE3" },
    school,
    {
      any: [
        { field: "belgianGermanSchoolRoute", op: "eq", value: "DG_ORGANISED" },
        { field: "belgianGermanSchoolRoute", op: "eq", value: "DG_SUBSIDISED" },
      ],
    },
  ],
};
const ordinaryOrSpecialised: Condition = {
  all: [
    inScope,
    { field: "belgianGermanReducedHoursSecondary", op: "eq", value: false },
  ],
};

export const belgiumGermanSchoolRequirements: CatalogueRequirement[] = [
  {
    ...belgiumRequirement({
      id: "bel.german-school-project",
      topic: "education_childcare",
      obligationClass: "STATUTORY_DUTY",
      condition: ordinaryOrSpecialised,
      action:
        "Maintain the school project approved by the organising body for the German-speaking Community school.",
      applicabilityExplanation:
        "Article 20 applies to ordinary and specialised schools organised or subsidised by the German-speaking Community, excluding its reduced-hours secondary category. The school community prepares the project for each school, and the organising body approves it.",
      unknownExplanation:
        "Confirm the school's Community route, reduced-hours secondary classification, actual provider status and operating location with the competent authority.",
      expectedEvidence: [
        "Current school project and organising-body approval",
        "Record of review after material changes",
      ],
      sourceIds: ["bel-german-school-decree"],
      signalKeys: [],
    }),
    effective: { from: belgiumGermanSchoolReview.verifiedAt, to: null },
    review: belgiumGermanSchoolReview,
    materialChangeReason:
      "Initial reviewed German Community school-project action",
  },
  {
    ...belgiumRequirement({
      id: "bel.german-school-rules",
      topic: "registration_governance",
      obligationClass: "STATUTORY_DUTY",
      condition: ordinaryOrSpecialised,
      action:
        "Maintain the school's internal regulations and obtain required acknowledgements at enrolment and after changes.",
      applicabilityExplanation:
        "Articles 40–41 apply to ordinary and specialised organised or subsidised schools, excluding the reduced-hours secondary category. The organising body establishes regulations; responsible adults, and secondary pupils, sign them at enrolment and whenever amended.",
      unknownExplanation:
        "Confirm the school's Community route, reduced-hours secondary classification and current acknowledgement process with the authority.",
      expectedEvidence: [
        "Current school regulations and amendment history",
        "Acknowledgement process for responsible adults and secondary pupils",
      ],
      sourceIds: ["bel-german-school-decree"],
      signalKeys: ["agreements"],
    }),
    effective: { from: belgiumGermanSchoolReview.verifiedAt, to: null },
    review: belgiumGermanSchoolReview,
    materialChangeReason:
      "Initial reviewed German Community school-rules action",
  },
  {
    ...belgiumRequirement({
      id: "bel.german-school-attendance-control",
      topic: "education_childcare",
      obligationClass: "STATUTORY_DUTY",
      condition: inScope,
      action:
        "Support official checks of enrolment and regular attendance under the German-speaking Community's current process.",
      applicabilityExplanation:
        "Article 28 obliges the school head to help control services verify enrolment and regular attendance, including in reduced-hours secondary provision under Article 1. The government determines accepted absences; portal attendance is supporting evidence, not proof of a government filing.",
      unknownExplanation:
        "Confirm the school's Community route and the current inspection and absence process with the authority.",
      expectedEvidence: [
        "Enrolment and attendance-control procedure",
        "Records supplied to the competent control service when requested",
      ],
      sourceIds: ["bel-german-school-decree"],
      signalKeys: ["attendance"],
    }),
    effective: { from: belgiumGermanSchoolReview.verifiedAt, to: null },
    review: belgiumGermanSchoolReview,
    materialChangeReason:
      "Initial reviewed German Community attendance-control action",
  },
];
