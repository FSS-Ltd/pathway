import type { CatalogueRequirement, TrackerCatalogue } from "../schema";
import { belgiumRequirement, belgiumSource } from "./shared";

export const belgiumSchoolReview = {
  reviewer: "Codex primary-source and applicability review (automated)",
  verifiedAt: "2026-10-21",
  reviewDueAt: "2027-01-15",
  revision: "belgium-flemish-school-2026-10-21-r1",
};

const territory = ["BE", "BE-FLEMISH-COMMUNITY", "BE1", "BE2"];

export const belgiumSchoolSources: TrackerCatalogue["sources"] = [
  {
    ...belgiumSource({
      id: "bel-flemish-school-recognition",
      url: "https://www.vlaanderen.be/erkenning-van-een-school-of-andere-onderwijsinstelling",
      title: "Recognition of a school or other educational institution",
      authority: "Flemish Government",
      provision:
        "Recognition of schools in Flanders and Brussels is a condition for issuing official study certificates and for public funding; an institution may be recognised without funding.",
      classification: "GUIDANCE",
      language: "nl",
    }),
    territory,
    retrievedAt: belgiumSchoolReview.verifiedAt,
    review: belgiumSchoolReview,
    effective: {
      from: null,
      to: null,
      currentAsOf: belgiumSchoolReview.verifiedAt,
      unknownReason:
        "Living authority guidance verified; commencement of every amendment was not reconstructed.",
    },
  },
  {
    ...belgiumSource({
      id: "bel-flemish-school-recognition-process",
      url: "https://www.vlaanderen.be/onderwijsprofessionals/organisatie-en-administratie/onderwijskwaliteit-en-toezicht/toezicht-op-de-onderwijskwaliteit/erkenningsonderzoek-scholen-academies-en-centra",
      title: "Recognition inspection for schools and centres",
      authority: "Flemish education inspectorate",
      provision:
        "New in-scope schools receive provisional recognition for one school year, followed by inspection and a government decision on definitive recognition; the recognition conditions include responsible governance, safe premises and inspection access.",
      classification: "GUIDANCE",
      language: "nl",
    }),
    territory,
    retrievedAt: belgiumSchoolReview.verifiedAt,
    review: belgiumSchoolReview,
    effective: {
      from: null,
      to: null,
      currentAsOf: belgiumSchoolReview.verifiedAt,
      unknownReason:
        "Living authority guidance verified; commencement of every amendment was not reconstructed.",
    },
  },
  {
    ...belgiumSource({
      id: "bel-flemish-primary-recognition-circular",
      url: "https://data-onderwijs.vlaanderen.be/edulex/document.aspx?docid=9284",
      title:
        "BaO/97/3: recognition, financing and subsidies of primary schools",
      authority: "Flemish education administration (AGODI)",
      provision:
        "Primary-school recognition conditions and provisional/definitive decisions under the Basic Education Decree, Articles 62–75; recognition and funding remain separate. The 2026–27 application timetable is subject to the circular's stated legislative caveat.",
      classification: "GUIDANCE",
      language: "nl",
    }),
    territory,
    publishedAt: "1997-06-17",
    publishedDateUnknownReason: null,
    retrievedAt: belgiumSchoolReview.verifiedAt,
    review: belgiumSchoolReview,
    effective: {
      from: null,
      to: null,
      currentAsOf: belgiumSchoolReview.verifiedAt,
      unknownReason:
        "The circular was amended on 6 July 2026 and flags a legislative caveat for the 2026–27 timetable; no universal deadline is asserted in this action.",
    },
  },
];

export const belgiumSchoolRequirements: CatalogueRequirement[] = [
  {
    ...belgiumRequirement({
      id: "bel.flemish-school-recognition",
      topic: "registration_governance",
      obligationClass: "STATUTORY_DUTY",
      condition: {
        all: [
          { field: "belgianEducationCommunity", op: "eq", value: "FLEMISH" },
          {
            field: "belgianSchoolRecognitionStatus",
            op: "eq",
            value: "COMMUNITY_RECOGNISED",
          },
          {
            any: [
              { field: "providerCategory", op: "eq", value: "STATE_SCHOOL" },
              {
                field: "providerCategory",
                op: "eq",
                value: "INDEPENDENT_SCHOOL",
              },
            ],
          },
          {
            any: [
              { field: "subdivisionCode", op: "eq", value: "BE1" },
              { field: "subdivisionCode", op: "eq", value: "BE2" },
            ],
          },
        ],
      },
      action:
        "Hold the Flemish school-recognition decision for this provision and maintain the applicable recognition conditions.",
      applicabilityExplanation:
        "Applies to an actual school declaring Flemish Community recognition in Flanders or Brussels. Recognition is separate from funding; an unrecognised private or externally recognised school needs a different authority review.",
      unknownExplanation:
        "Confirm the school's actual provider category, education Community, recognition decision and operating Region with the Flemish education authority.",
      expectedEvidence: [
        "Site-specific provisional or definitive Flemish recognition decision",
        "Applicable inspection report, conditions and follow-up decision",
      ],
      sourceIds: [
        "bel-flemish-school-recognition",
        "bel-flemish-school-recognition-process",
        "bel-flemish-primary-recognition-circular",
      ],
      signalKeys: [],
    }),
    effective: { from: belgiumSchoolReview.verifiedAt, to: null },
    review: belgiumSchoolReview,
    materialChangeReason: "Initial reviewed Flemish school-recognition action",
  },
];
