import type { CatalogueRequirement } from "../schema";
import {
  children,
  creche,
  formalSchool,
  mainlandDistrictCodes,
  outOfSchool,
  portugalRequirement as action,
  preschool,
  privateSchool,
} from "./shared";

const regionalEducation: NonNullable<CatalogueRequirement["condition"]> = {
  any: [privateSchool, preschool, creche, outOfSchool],
};

export const portugalInstitutionRequirements: CatalogueRequirement[] = [
  action({
    id: "pt.provider-classification",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Record the actual school, preschool, creche, CATL, supplementary tuition or community-service route and its legal operator before relying on a portal sector.",
    applicabilityExplanation:
      "ACE, Church and Learning Centre screens do not establish Portuguese school status, public funding, social-response licensing or regional permissions.",
    unknownExplanation:
      "Confirm ages, teaching claims, care pattern, region, legal operator, funding and authority decisions.",
    expectedEvidence: [
      "Provider classification and competent-authority correspondence",
    ],
    sourceIds: ["pt-social-establishments", "pt-caop"],
    signalKeys: [],
  }),
  ...mainlandDistrictCodes.map((jurisdiction) =>
    action({
      id: `pt.mainland-private-school-${jurisdiction.slice(-2)}`,
      jurisdiction,
      topic: "registration_governance",
      obligationClass: "STATUTORY_DUTY",
      condition: privateSchool,
      action:
        "For an actual mainland private or cooperative school, verify the operating authorisation, approved site, educational levels, capacity and pedagogical direction.",
      applicabilityExplanation:
        "The mainland private-education statute applies to authorised school provision; public subsidy alone does not change the operator's legal status.",
      unknownExplanation:
        "Confirm registered school type, site, operator, pupil ages and the competent education authority.",
      expectedEvidence: [
        "Operating authorisation, educational project, internal rules and approved capacity",
      ],
      sourceIds: ["pt-private-school"],
      signalKeys: ["attendance"],
      allowsNotApplicable: true,
      notApplicablePolicy:
        "Explain why the provision is outside private-school authorisation and confirm a doubtful school claim with the education authority.",
    }),
  ),
  action({
    id: "pt.azores-education-authorisation",
    jurisdiction: "PT-AZO",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: regionalEducation,
    action:
      "Check the Azores' regional authorisation route for the actual private, cooperative or solidarity school, preschool, creche or CATL provision.",
    applicabilityExplanation:
      "The Azores statute expressly includes private educational provision and childcare/time-use activity centres under regional administration.",
    unknownExplanation:
      "Confirm service type, child count, operator, premises, educational claim and regional department decision.",
    expectedEvidence: [
      "Regional authorisation or documented exemption, approved service scope and site documents",
    ],
    sourceIds: ["pt-azores-school"],
    signalKeys: ["attendance"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document the reason the actual service is outside the regional statute and verify uncertain cases with the Azores education or social authority.",
  }),
  action({
    id: "pt.madeira-education-authorisation",
    jurisdiction: "PT-MAD",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: regionalEducation,
    action:
      "Check Madeira's regional private-education and social-response routes for the actual school, preschool, creche or other educational service.",
    applicabilityExplanation:
      "Madeira has a separate private-education statute; mainland authorisation cannot be assumed to cover the regional site.",
    unknownExplanation:
      "Confirm service type, operator, site, educational claim and the competent Madeira regional authority.",
    expectedEvidence: [
      "Regional authorisation or social-response decision, approved scope and site documents",
    ],
    sourceIds: ["pt-madeira-school", "pt-social-establishments"],
    signalKeys: ["attendance"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document why the actual provision is outside the regional authorisation route and check uncertain cases with Madeira's education or social authority.",
  }),
  action({
    id: "pt.social-response-authorisation",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: creche,
    action:
      "For an actual social-response creche, verify the applicable prior-communication, licence or authorisation path before operation and maintain material changes.",
    applicabilityExplanation:
      "The current social-establishment regime includes communication routes and applies in autonomous regions with institutional adaptations; the gov.pt creche service describes a licence path.",
    unknownExplanation:
      "Confirm service form, region, operator, opening date, capacity, site and the competent social-security authority.",
    expectedEvidence: [
      "Communication or licence receipt, authority decision, staff map and approved site/capacity",
    ],
    sourceIds: ["pt-social-establishments", "pt-creche-license"],
    signalKeys: ["attendance", "personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why the actual care is outside a regulated creche and verify an uncertain route with the competent regional social-security authority.",
  }),
  action({
    id: "pt.preschool-route",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: preschool,
    action:
      "Classify the actual preschool as public, private, cooperative or solidarity provision and verify the competent mainland or autonomous-region operating decision.",
    applicabilityExplanation:
      "An early-years screen, public support or child age does not establish the preschool's legal operator or applicable authorisation route.",
    unknownExplanation:
      "Confirm operator, registered educational form, region, building, ages, funding contract and education authority.",
    expectedEvidence: [
      "Preschool classification, authorisation or public-establishment record and authority correspondence",
    ],
    sourceIds: ["pt-private-school", "pt-social-establishments"],
    signalKeys: ["attendance"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Describe why no regulated preschool education is provided and verify borderline care or teaching with the territorial education authority.",
  }),
  action({
    id: "pt.catl-route",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: outOfSchool,
    action:
      "Determine whether after-school care is a licensed CATL social response, supplementary tutoring, a school activity or another service; obtain the required authority decision.",
    applicabilityExplanation:
      "A Learning Centre or club label does not settle CATL licensing; mainland and autonomous-region routes differ.",
    unknownExplanation:
      "Confirm ages, simultaneous child count, care hours, operator, meals, site and educational claims.",
    expectedEvidence: [
      "CATL or tuition classification, authority correspondence and any licence/communication record",
    ],
    sourceIds: [
      "pt-social-establishments",
      "pt-atl-license",
      "pt-atl-standards",
    ],
    signalKeys: ["attendance"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Describe why the activity is outside CATL or school authorisation and check doubtful cases with social security and the education authority.",
  }),
  action({
    id: "pt.child-protection-response",
    topic: "safeguarding",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Maintain a child-protection procedure with safe reporting, immediate response, restricted records and a route to the competent CPCJ or judicial authority.",
    applicabilityExplanation:
      "The protection law assigns functions by entity and situation; a tracker record must not expose case details or imply that every report follows one route.",
    unknownExplanation:
      "Confirm who serves minors, responsible staff, local CPCJ contacts and the circumstances requiring emergency action.",
    expectedEvidence: [
      "Restricted procedure, referral contacts, staff briefing and review record",
    ],
    sourceIds: ["pt-child-protection"],
    signalKeys: ["safeguarding", "personnel"],
  }),
  action({
    id: "pt.child-contact-criminal-record",
    topic: "personnel",
    obligationClass: "STATUTORY_DUTY",
    condition: children,
    action:
      "Before assigning paid or unpaid work with regular contact with minors, request the role-specific criminal-record certificate and assess suitability.",
    applicabilityExplanation:
      "Article 2 follows the actual regular child-contact function, including volunteers; an adult portal account alone is not a screening trigger.",
    unknownExplanation:
      "Confirm roles, frequency of minor contact, recruitment stage, certificate purpose and responsible reviewer.",
    expectedEvidence: [
      "Restricted role assessment, certificate verification date and suitability decision",
    ],
    sourceIds: ["pt-criminal-record"],
    signalKeys: ["personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why a role has no regular minor contact and check borderline roles with the competent authority before omitting a check.",
  }),
  action({
    id: "pt.school-curriculum",
    topic: "education_childcare",
    obligationClass: "STATUTORY_DUTY",
    condition: formalSchool,
    action:
      "For an actual basic or secondary school, document the curriculum, assessment, attendance and family information required for its authorised level and route.",
    applicabilityExplanation:
      "The national curriculum framework covers public and private/cooperative schooling; regional variations and authorised own programmes need separate review.",
    unknownExplanation:
      "Confirm educational level, approved curriculum, school type, region and learner ages.",
    expectedEvidence: [
      "Approved educational project, curriculum, attendance and assessment records",
    ],
    sourceIds: ["pt-curriculum", "pt-private-school"],
    signalKeys: ["attendance"],
  }),
  action({
    id: "pt.inclusive-education",
    topic: "education_childcare",
    obligationClass: "STATUTORY_DUTY",
    condition: { any: [formalSchool, preschool] },
    action:
      "Provide the applicable inclusive-education support measures and document individual decisions for children needing them.",
    applicabilityExplanation:
      "The inclusive-education framework covers the relevant public, private, cooperative and solidarity education networks, subject to actual provision and regional implementation.",
    unknownExplanation:
      "Confirm school or preschool status, child needs, multidisciplinary responsibilities and regional guidance.",
    expectedEvidence: [
      "Support assessments, plans and family consultation records with restricted access",
    ],
    sourceIds: ["pt-inclusion"],
    signalKeys: ["attendance", "medical"],
  }),
  action({
    id: "pt.creche-standards",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: creche,
    action:
      "Check age-appropriate creche staffing, care programme, parent information and installation standards under the competent territorial rules.",
    applicabilityExplanation:
      "The mainland creche portaria is a concrete baseline; autonomous regions and site authorisations require separate confirmation.",
    unknownExplanation:
      "Confirm child ages, staff qualifications, group sizes, opening hours, region and licensed service form.",
    expectedEvidence: [
      "Staffing plan, programme, parent information and regulator inspection records",
    ],
    sourceIds: ["pt-creche-standards", "pt-social-establishments"],
    signalKeys: ["attendance", "personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document why the provision is not a regulated creche and confirm uncertain ages or service categories with the territorial authority.",
  }),
  action({
    id: "pt.icce-provider",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: { field: "icce", op: "eq", value: true },
    action:
      "For actual ICCE participation, maintain provider registration, trained moderation, learner enrolment and approved projection evidence.",
    applicabilityExplanation:
      "ICCE terms apply only to participants and do not establish Portuguese school status or qualification recognition.",
    unknownExplanation:
      "Confirm current ICCE registration, trained moderator, student enrolments and moderation terms directly with ICCE.",
    expectedEvidence: [
      "ICCE registration, enrolment, moderator training and projection records",
    ],
    sourceIds: [
      "pt-icce-registration",
      "pt-icce-enrolment",
      "pt-icce-moderation",
    ],
    signalKeys: ["ace"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record that no ICCE qualification is offered and verify a doubtful provider claim with ICCE before dismissing its terms.",
  }),
];
