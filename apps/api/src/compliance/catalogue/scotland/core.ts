import type { CatalogueRequirement } from "../schema";
import { scotlandRequirement as action } from "./shared";

const independent = {
  field: "providerCategory",
  op: "eq",
  value: "INDEPENDENT_SCHOOL",
} as const;
const children = { field: "minimumAge", op: "lte", value: 17 } as const;
const care: CatalogueRequirement["condition"] = {
  any: [
    { field: "providerCategory", op: "eq", value: "CHILDCARE" },
    { field: "providerCategory", op: "eq", value: "EARLY_YEARS" },
    { field: "childcare", op: "eq", value: true },
  ],
};

export const coreRequirements: CatalogueRequirement[] = [
  action({
    id: "sct.provider-classification",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Classify the site's actual Scottish school, care, childcare and out-of-school provision before applying registration routes.",
    applicabilityExplanation:
      "A School or Learning Centre product type and ACE participation do not establish legal school or care-service status.",
    unknownExplanation:
      "Record ages, teaching pattern, care and any residential activity; seek the appropriate registrar or Care Inspectorate classification where uncertain.",
    expectedEvidence: [
      "Provision and age assessment, regulator correspondence and responsible-person decision",
    ],
    sourceIds: ["sct-school-registration", "sct-care-register"],
    signalKeys: [],
  }),
  action({
    id: "sct.independent-registration",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: independent,
    action:
      "Hold Scottish independent-school registration before operating and obtain approval for changes to registered particulars where required.",
    applicabilityExplanation:
      "This route depends on actual independent-school status, including where an ACE, church, charity or learning centre operates the school.",
    unknownExplanation:
      "Confirm whether the provision meets the Scottish independent-school definition and obtain the Registrar's decision.",
    expectedEvidence: [
      "Registration decision, approved particulars, change applications and regulator correspondence",
    ],
    sourceIds: ["sct-school-registration"],
    signalKeys: [],
  }),
  action({
    id: "sct.care-registration",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: care,
    action:
      "Determine and hold Care Inspectorate registration before providing a regulated day-care or school-age childcare service.",
    applicabilityExplanation:
      "Section 59 requires registration of a care service; service definitions and exclusions depend on actual provision, not sector branding.",
    unknownExplanation:
      "Confirm whether the actual activity meets a statutory care-service category or exception with the Care Inspectorate.",
    expectedEvidence: [
      "Care-service category assessment, registration certificate and conditions, or documented exception decision",
    ],
    sourceIds: ["sct-care-law", "sct-care-register"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Only after a documented Care Inspectorate or legal classification confirms that the actual provision is not a registrable care service.",
  }),
  action({
    id: "sct.child-protection-framework",
    topic: "safeguarding",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Maintain child-protection reporting, escalation, recording and local referral procedures for child-facing provision.",
    applicabilityExplanation:
      "Scottish national guidance is a framework for all who support children; local Child Protection Committee and council routes must be confirmed separately.",
    unknownExplanation:
      "Confirm whether under-18s receive services and identify the local referral route and responsible lead.",
    expectedEvidence: [
      "Versioned procedures, named leads, referral contacts, training and concern-record retention controls",
    ],
    sourceIds: ["sct-child-protection"],
    signalKeys: ["safeguarding"],
  }),
  action({
    id: "sct.independent-safeguarding",
    topic: "safeguarding",
    obligationClass: "STATUTORY_DUTY",
    condition: independent,
    action:
      "Resource and oversee the independent school's child-protection roles, procedures and staff training.",
    applicabilityExplanation:
      "Independent-school proprietors must safeguard learners and prevent objectionable operation; Scottish proprietor guidance explains the oversight expectations.",
    unknownExplanation:
      "Establish actual independent-school status and the proprietor's responsibilities.",
    expectedEvidence: [
      "Proprietor review, designated-role records, policies, staff training and referral/audit trail",
    ],
    sourceIds: ["sct-school-safeguarding", "sct-child-protection"],
    signalKeys: ["safeguarding", "personnel"],
  }),
  action({
    id: "sct.pvg-role-assessment",
    topic: "personnel",
    obligationClass: "STATUTORY_DUTY",
    condition: children,
    action:
      "Assess paid and volunteer roles and verify PVG membership before anyone performs a regulated role with children.",
    applicabilityExplanation:
      "From July 2025 both the individual and organisation have legal obligations for regulated roles; incidental contact or an adult/parent portal account alone does not trigger PVG membership.",
    unknownExplanation:
      "Record each person's actual duties, contact and statutory exceptions before deciding whether the role is regulated.",
    expectedEvidence: [
      "Role-by-role eligibility decision, PVG membership verification and recruitment date, with periodic organisation review",
    ],
    sourceIds: ["sct-pvg"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "sct.independent-teachers",
    topic: "personnel",
    obligationClass: "STATUTORY_DUTY",
    condition: independent,
    action:
      "Verify GTC Scotland registration for teachers in the independent school.",
    applicabilityExplanation:
      "The Scottish independent-school teacher requirement applies to teaching roles, not every volunteer, support worker or portal user.",
    unknownExplanation:
      "Identify actual teachers and verify the school's registration category and any lawful exception.",
    expectedEvidence: [
      "Teacher role list, GTC Scotland registration checks and review dates",
    ],
    sourceIds: ["sct-gtcs"],
    signalKeys: ["personnel"],
  }),
];
