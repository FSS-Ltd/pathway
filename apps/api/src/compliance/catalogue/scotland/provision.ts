import type { CatalogueRequirement } from "../schema";
import { scotlandRequirement as action } from "./shared";

const school: CatalogueRequirement["condition"] = {
  any: [
    { field: "providerCategory", op: "eq", value: "STATE_SCHOOL" },
    { field: "providerCategory", op: "eq", value: "INDEPENDENT_SCHOOL" },
  ],
};
const state = {
  field: "providerCategory",
  op: "eq",
  value: "STATE_SCHOOL",
} as const;
const childcare = { field: "childcare", op: "eq", value: true } as const;
const foodBusiness = { field: "foodBusiness", op: "eq", value: true } as const;
const ownVehicles = {
  field: "operatesVehicles",
  op: "eq",
  value: true,
} as const;
const trips = { field: "trips", op: "eq", value: true } as const;
const boarding = { field: "boarding", op: "eq", value: true } as const;
const icce = { field: "icce", op: "eq", value: true } as const;

export const provisionRequirements: CatalogueRequirement[] = [
  action({
    id: "sct.school-attendance",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: school,
    action:
      "Review school attendance and absence procedures against the 2026 Scottish national guidance.",
    applicabilityExplanation:
      "The 2026 guidance is non-statutory for public schools and education authorities; independent schools may consider it when developing their own policies.",
    unknownExplanation:
      "Confirm actual school status, attendance responsibilities and local authority arrangements.",
    expectedEvidence: [
      "Attendance policy, recording routes, response to absence and local authority contacts",
    ],
    sourceIds: ["sct-attendance"],
    signalKeys: ["attendance"],
  }),
  action({
    id: "sct.additional-support",
    topic: "education_childcare",
    obligationClass: "STATUTORY_GUIDANCE",
    condition: state,
    action:
      "Review the education authority's process for identifying, planning and reviewing additional support needs.",
    applicabilityExplanation:
      "The operative third-edition Scottish code explains duties on education authorities and appropriate agencies; a draft fourth edition is not treated as current law.",
    unknownExplanation:
      "Identify the responsible education authority and the school's actual support arrangements.",
    expectedEvidence: [
      "Authority procedure, child support planning route, review dates and family communication",
    ],
    sourceIds: ["sct-asl"],
    signalKeys: [],
  }),
  action({
    id: "sct.care-conditions",
    topic: "education_childcare",
    obligationClass: "STATUTORY_DUTY",
    condition: childcare,
    action:
      "Operate regulated daycare or school-age childcare within Care Inspectorate registration conditions.",
    applicabilityExplanation:
      "Where the actual service is registrable, its certificate and conditions govern provision; a learning centre with no care service is not automatically registered.",
    unknownExplanation:
      "Confirm the actual care-service classification and current registration conditions.",
    expectedEvidence: [
      "Certificate and conditions, inspection responses, staffing and service-change records",
    ],
    sourceIds: ["sct-care-law", "sct-care-register"],
    signalKeys: ["personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Only after documenting why actual provision is not a registrable care service, including any regulator confirmation.",
  }),
  action({
    id: "sct.funded-elc",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: childcare,
    action:
      "Check whether funded ELC delivery requires the National Standard and a local-authority contract.",
    applicabilityExplanation:
      "Providers choosing to deliver funded early learning and childcare must meet the National Standard and local authority contract terms; generic public funding alone is insufficient evidence.",
    unknownExplanation:
      "Confirm whether the site delivers funded ELC and obtain the responsible council's current terms.",
    expectedEvidence: [
      "Funded ELC decision, local authority contract or documented non-participation, quality assessment",
    ],
    sourceIds: ["sct-funded-elc"],
    signalKeys: [],
  }),
  action({
    id: "sct.food-registration",
    topic: "activities",
    obligationClass: "STATUTORY_DUTY",
    condition: foodBusiness,
    action:
      "Register each food-business establishment with the responsible Scottish local authority.",
    applicabilityExplanation:
      "Providing food is not always operating a food business; this action applies once the site's food-business status is confirmed.",
    unknownExplanation:
      "Establish whether preparation or supply is a food business and which authority is responsible.",
    expectedEvidence: [
      "Food-business classification, authority registration and establishment details",
    ],
    sourceIds: ["sct-food-law", "sct-food-register"],
    signalKeys: [],
  }),
  action({
    id: "sct.food-procedures",
    topic: "activities",
    obligationClass: "STATUTORY_DUTY",
    condition: foodBusiness,
    action:
      "Maintain food safety procedures based on HACCP principles for in-scope food activities.",
    applicabilityExplanation:
      "The exact procedures should match the confirmed food business and its operations.",
    unknownExplanation:
      "Confirm food-business status and the preparation and service activities performed.",
    expectedEvidence: [
      "Food safety management procedures, training and monitoring records",
    ],
    sourceIds: ["sct-food-haccp"],
    signalKeys: [],
  }),
  action({
    id: "sct.trip-planning",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: trips,
    action:
      "Plan trips with proportionate risk, supervision, safeguarding and emergency arrangements.",
    applicabilityExplanation:
      "Trip duties follow the activity and employer responsibilities; no universal trip certificate is created by this checklist.",
    unknownExplanation:
      "Confirm which visits and transport arrangements the site actually provides.",
    expectedEvidence: [
      "Visit plan, risk decisions, permissions and incident contacts",
    ],
    sourceIds: ["sct-trips"],
    signalKeys: ["trips"],
  }),
  action({
    id: "sct.vehicle-licensing",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: ownVehicles,
    action:
      "Check the permit, operator and driver licensing route for the site's own passenger vehicles.",
    applicabilityExplanation:
      "Section 19/22 permits are conditional; using contracted transport does not by itself make the institution the operator.",
    unknownExplanation:
      "Confirm vehicle ownership or operation, passengers, charging and the licensing route.",
    expectedEvidence: [
      "Operator decision, permits/licences, driver checks and vehicle maintenance",
    ],
    sourceIds: ["sct-transport"],
    signalKeys: [],
  }),
  action({
    id: "sct.school-care-accommodation",
    topic: "activities",
    obligationClass: "STATUTORY_DUTY",
    condition: boarding,
    action:
      "Assess and hold separate Care Inspectorate registration for school care accommodation.",
    applicabilityExplanation:
      "Scottish boarding or residential school provision is a separate regulated care-service route, beyond school registration.",
    unknownExplanation:
      "Confirm whether the site provides residential care and the applicable service definition.",
    expectedEvidence: [
      "Care Inspectorate service classification, certificate, conditions and inspection correspondence",
    ],
    sourceIds: ["sct-boarding", "sct-care-law"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Only where documented facts or regulator advice establish that accommodation is outside the school care accommodation category.",
  }),
  action({
    id: "sct.icce-registration",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Maintain the applicable ICCE provider registration and renewal evidence.",
    applicabilityExplanation:
      "ICCE requirements apply only when the institution offers ICCE qualifications; ACE branding alone is not enough.",
    unknownExplanation:
      "Confirm ICCE participation and the current entity-specific provider agreement.",
    expectedEvidence: [
      "ICCE registration, visits, renewal correspondence and agreement terms",
    ],
    sourceIds: ["sct-icce-registration"],
    signalKeys: ["ace"],
  }),
  action({
    id: "sct.icce-academic",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Keep ICCE staff training, student enrolment and approved academic projections current.",
    applicabilityExplanation:
      "Provider training and enrolment terms vary by role and qualification; portal records support evidence without implying external approval.",
    unknownExplanation:
      "Confirm actual ICCE certificates, staff roles and provider approval status.",
    expectedEvidence: [
      "Training records, enrolment acknowledgements and provider-approved projections",
    ],
    sourceIds: ["sct-icce-training", "sct-icce-enrolment"],
    signalKeys: ["ace", "personnel"],
  }),
  action({
    id: "sct.icce-moderation",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Arrange required ICCE internal and external moderation for offered qualifications.",
    applicabilityExplanation:
      "Only participating institutions with relevant students and qualifications need this provider route.",
    unknownExplanation:
      "Confirm qualification offering, enrolments and current moderation schedule.",
    expectedEvidence: [
      "Moderator assignment, internal samples, external submissions and provider responses",
    ],
    sourceIds: ["sct-icce-moderation"],
    signalKeys: ["ace"],
  }),
];
