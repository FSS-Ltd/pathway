import type { CatalogueRequirement } from "../schema";
import { austriaRequirement as action } from "./shared";

const independent = {
  field: "providerCategory",
  op: "eq",
  value: "INDEPENDENT_SCHOOL",
} as const;
const school: CatalogueRequirement["condition"] = {
  any: [
    { field: "providerCategory", op: "eq", value: "STATE_SCHOOL" },
    independent,
  ],
};
const children = { field: "minimumAge", op: "lte", value: 17 } as const;
const care: CatalogueRequirement["condition"] = {
  any: [
    { field: "providerCategory", op: "eq", value: "EARLY_YEARS" },
    { field: "providerCategory", op: "eq", value: "CHILDCARE" },
    { field: "childcare", op: "eq", value: true },
  ],
};

export const coreRequirements: CatalogueRequirement[] = [
  action({
    id: "aut.provider-classification",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Classify the actual school, tutoring, childcare or other activity and identify its competent Austrian authority.",
    applicabilityExplanation:
      "The Private Schools Act defines a school by its provision; ACE branding, funding and a portal screen set do not decide legal status.",
    unknownExplanation:
      "Document group teaching, fixed curriculum, educational aim, ages, hours and Land before selecting a route.",
    expectedEvidence: [
      "Provision assessment and written school or Land authority advice where classification is uncertain",
    ],
    sourceIds: ["aut-private-definition", "aut-kindergarten"],
    signalKeys: [],
  }),
  action({
    id: "aut.private-school-opening",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: independent,
    action:
      "For an actual private school, document the current 2026 statutory notice to the competent school authority before opening.",
    applicabilityExplanation:
      "Privatschulgesetz § 7 currently requires notice at least three months before intended opening. An amendment changes the route from 2027 and must be reviewed separately.",
    unknownExplanation:
      "Confirm whether the activity meets the Act's school definition and the opening date; obtain authority advice if the 2027 transition is relevant.",
    expectedEvidence: [
      "School classification, dated notice, supporting documents and authority response",
    ],
    sourceIds: ["aut-private-definition", "aut-private-opening"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Only with documented facts or school-authority advice showing the provider is not a private school under the Act.",
    reviewCadenceDays: 60,
    reviewCadenceBasis:
      "Planning reminder before the 1 January 2027 statutory change; confirm the then-operative route with the school authority.",
  }),
  action({
    id: "aut.school-protection-concept",
    topic: "safeguarding",
    obligationClass: "STATUTORY_DUTY",
    condition: school,
    action:
      "Confirm whether Schulordnung 2024 applies and, where it does, maintain the school's child-protection concept and risk analysis.",
    applicabilityExplanation:
      "Section 4 requires a protection concept for covered schools; the reach to a particular private-school category depends on its school-law status.",
    unknownExplanation:
      "Confirm school category, public status and the school authority's view of the ordinance's application.",
    expectedEvidence: [
      "Applicability decision, concept, risk analysis, conduct rules and accessible publication",
    ],
    sourceIds: ["aut-school-protection"],
    signalKeys: ["safeguarding"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Only after documented legal-status assessment or school-authority advice confirms that the ordinance does not cover this site; other child-protection duties need separate review.",
  }),
  action({
    id: "aut.child-facing-roles",
    topic: "personnel",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Assess child-facing roles and record whether a special child and youth welfare criminal-record certificate is required or appropriate.",
    applicabilityExplanation:
      "The special certificate is available for specified mainly child-supervising work; an adult or parent portal account alone does not establish a role or a universal check duty.",
    unknownExplanation:
      "Record actual duties, supervision, frequency, sector rules and the appropriate authority's requirements.",
    expectedEvidence: [
      "Role assessments, applicable certificates or authority decisions and organisation review dates",
    ],
    sourceIds: ["aut-child-certificate"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "aut.land-childcare-route",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: care,
    action:
      "Identify the applicable Bundesland childcare authorisation, staffing, safeguarding and inspection conditions before offering care.",
    applicabilityExplanation:
      "Kindergarten and childcare rules differ among the nine Länder; a national checklist cannot substitute for the site's Land law and permit.",
    unknownExplanation:
      "Confirm Bundesland, service type, ages, hours and the competent Land or district authority.",
    expectedEvidence: [
      "Land classification, permit or documented exception, staffing requirements and inspection correspondence",
    ],
    sourceIds: ["aut-kindergarten"],
    signalKeys: ["personnel", "safeguarding"],
  }),
  action({
    id: "aut.compulsory-education-route",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: school,
    action:
      "Confirm how pupils' compulsory education is fulfilled for the site's actual school status and inform families of any required notice or assessment route.",
    applicabilityExplanation:
      "A private school's public status affects the family pathway; provider status and family obligations must not be conflated.",
    unknownExplanation:
      "Confirm school public status, pupil ages and the relevant Bildungsdirektion's instructions.",
    expectedEvidence: [
      "School-status decision, family information and Bildungsdirektion correspondence without child-level disclosure",
    ],
    sourceIds: ["aut-school-attendance"],
    signalKeys: ["attendance"],
  }),
];
