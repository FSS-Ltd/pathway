import type { CatalogueRequirement, TrackerCatalogue } from "../schema";
import { independentSchool } from "./conditions";
import { englandRequirement, englandSource } from "./shared";

export const medicalSafetySources: TrackerCatalogue["sources"] = [
  englandSource({
    id: "eng-school-medical-law",
    url: "https://www.legislation.gov.uk/ukpga/2014/6/section/100",
    title: "Children and Families Act 2014: medical support",
    authority: "UK Parliament",
    provision:
      "Section 100(1)-(6); commencement annotation SI 2014/889 article 7(c)",
    classification: "LEGISLATION",
    publishedAt: null,
    publishedDateUnknownReason:
      "Exact original publication day not established",
    effective: {
      to: null,
      unknownReason: null,
      from: "2014-09-01",
    },
  }),
  englandSource({
    id: "eng-school-allergy-law",
    url: "https://www.legislation.gov.uk/ukpga/2014/6/section/100A",
    title: "Children and Families Act 2014: allergy policy",
    authority: "UK Parliament",
    provision:
      "Section 100A(1)-(6); section 100B regulation-making powers; Children’s Wellbeing and Schools Act 2026 section 34; SI 2026/933 regulation 2 commences substantive duties 1 September 2026",
    classification: "LEGISLATION",
    publishedAt: null,
    publishedDateUnknownReason:
      "Exact original publication day not established",
    effective: {
      to: null,
      unknownReason: null,
      from: "2026-09-01",
    },
  }),
  englandSource({
    id: "eng-school-medical-guidance",
    url: "https://assets.publishing.service.gov.uk/media/5ce6a72e40f0b620a103bd53/supporting-pupils-at-school-with-medical-conditions.pdf",
    title: "Supporting pupils at school with medical conditions",
    authority: "Department for Education",
    provision:
      "December 2015 edition: statutory paragraphs 10–14 and 17–23; text-box further advice is non-statutory; maintained-nursery/16–19 academy exclusions",
    classification: "GUIDANCE",
    publishedAt: null,
    publishedDateUnknownReason:
      "Exact original publication day not established",
    effective: {
      to: null,
      unknownReason:
        "Current guidance reviewed; edition application start not independently established",
      currentAsOf: "2026-10-15",
      from: null,
    },
  }),
  englandSource({
    id: "eng-school-allergy-guidance",
    url: "https://assets.publishing.service.gov.uk/media/6a4b8f49045e1108aaa5ebbc/allergy_safety_in_schools_statutory_guidance_June_2026.pdf",
    title: "Allergy safety in schools",
    authority: "Department for Education",
    provision:
      "July 2026 edition: scope; policy; training; IHPs; medicines; incidents. Read with current section 100A: annual review/publicity already statutory from 1 September 2026 despite future-tense passages. Separate training/spare-device regulations remain forthcoming in guidance.",
    classification: "GUIDANCE",
    publishedAt: "2026-07-06",
    publishedDateUnknownReason: null,
    effective: {
      to: null,
      unknownReason:
        "Current guidance reviewed; edition application start not independently established",
      currentAsOf: "2026-10-15",
      from: null,
    },
  }),
  englandSource({
    id: "eng-school-firstaid-law",
    url: "https://www.legislation.gov.uk/uksi/2014/3283/schedule/paragraph/13",
    title: "Independent School Standards: pupil first aid",
    authority: "UK Parliament",
    provision:
      "Schedule paragraph 13: timely competent first aid through effective written policy; regulation 1 commencement 5 January 2015",
    classification: "LEGISLATION",
    publishedAt: null,
    publishedDateUnknownReason:
      "Exact original publication day not established",
    effective: {
      to: null,
      unknownReason: null,
      from: "2015-01-05",
    },
  }),
];

export const medicalSafetyRequirements: CatalogueRequirement[] = [
  englandRequirement({
    id: "eng-school-medical-arrangements",
    action:
      "Maintain arrangements supporting pupils with medical conditions, having regard to the current statutory guidance.",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: {
      field: "englandSchoolMedicalDutiesApply",
      op: "eq",
      value: true,
    },
    applicabilityExplanation:
      "Section 100 applies to specified maintained schools, Academy schools/AP academies and PRUs, not every state-funded or independent provider. The explicit assessed section 100 applicability fact must be established against the exclusions below.",
    unknownExplanation:
      "Exclude maintained nursery schools, 16-to-19 academies and pupils who are young children within Childcare Act 2006 Part 3; confirm actual statutory school type. PRUs are covered. Record the assessed section 100 applicability; selected screen, sector, ages or funding alone cannot establish it.",
    expectedEvidence: [
      "Approved medical-support arrangements and named responsibility",
      "Pupil/parent and healthcare-professional consultation",
      "Cover for school activities and off-site education",
    ],
    sourceIds: ["eng-school-medical-law"],
    signalKeys: ["medical"],
    allowsNotApplicable: false,
    notApplicablePolicy: null,
  }),
  englandRequirement({
    id: "eng-school-medical-plans-medicines",
    action:
      "Review medical-support policy, individual healthcare-plan needs, medicines handling, consent, records, emergency cover and staff competence against statutory guidance.",
    topic: "premises_safety",
    obligationClass: "STATUTORY_GUIDANCE",
    condition: {
      field: "englandSchoolMedicalDutiesApply",
      op: "eq",
      value: true,
    },
    applicabilityExplanation:
      "Have regard to guidance; not every pupil with a condition needs an IHP. Assess proportionate support and medicine/training needs with parents and relevant healthcare professionals. Further-advice text boxes are non-statutory; a first-aid certificate alone does not establish competence for specific healthcare procedures.",
    unknownExplanation:
      "Exclude maintained nursery schools, 16-to-19 academies and pupils who are young children within Childcare Act 2006 Part 3; confirm actual statutory school type. PRUs are covered. Record the assessed section 100 applicability; selected screen, sector, ages or funding alone cannot establish it.",
    expectedEvidence: [
      "Documented individual-plan decisions and confidential plans where needed",
      "Medicine administration/storage/access procedures and records",
      "Role-specific training, healthcare advice and absence cover",
    ],
    sourceIds: ["eng-school-medical-law", "eng-school-medical-guidance"],
    signalKeys: ["medical"],
    allowsNotApplicable: false,
    notApplicablePolicy: null,
  }),
  englandRequirement({
    id: "eng-school-allergy-policy",
    action:
      "Maintain a written allergy safety policy, review it at least once every year, publish it on the school website and bring it to the attention of pupils, parents and all workers at least annually.",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: {
      field: "englandSchoolMedicalDutiesApply",
      op: "eq",
      value: true,
    },
    applicabilityExplanation:
      "Current section 100A duties apply from 1 September 2026 to section 100 schools. All workers includes unpaid workers. Independent and non-maintained-special-school equivalents are intended through separate standards and must not be inferred from this law.",
    unknownExplanation:
      "Exclude maintained nursery schools, 16-to-19 academies and pupils who are young children within Childcare Act 2006 Part 3; confirm actual statutory school type. PRUs are covered. Record the assessed section 100 applicability; selected screen, sector, ages or funding alone cannot establish it.",
    expectedEvidence: [
      "Written allergy/anaphylaxis policy and annual review",
      "Website publication and annual communication evidence",
      "Recorded changes and accountable appropriate authority",
    ],
    sourceIds: ["eng-school-allergy-law"],
    signalKeys: ["medical"],
    allowsNotApplicable: false,
    notApplicablePolicy: null,
    reviewCadenceDays: 365,
    reviewCadenceBasis:
      "Section 100A(4)-(5) requires review and bringing the policy to the attention of relevant people at least once every year. Calendar-year compliance must be tracked independently of this 365-day portal reminder; act sooner when changes require.",
  }),
  englandRequirement({
    id: "eng-school-allergy-implementation",
    action:
      "Have particular regard to allergy guidance when implementing identification, risk controls, training, healthcare plans, medicine access and incident learning.",
    topic: "premises_safety",
    obligationClass: "STATUTORY_GUIDANCE",
    condition: {
      field: "englandSchoolMedicalDutiesApply",
      op: "eq",
      value: true,
    },
    applicabilityExplanation:
      "Guidance expects regular at-least-annual allergy awareness training for pupil-facing staff and assesses IHP need by impact/risk/additional support. Do not present future training or spare-adrenaline regulations as existing standalone universal duties. External incident reporting depends on actual food-safety/RIDDOR/safeguarding triggers; no blanket reporting of all near misses.",
    unknownExplanation:
      "Exclude maintained nursery schools, 16-to-19 academies and pupils who are young children within Childcare Act 2006 Part 3; confirm actual statutory school type. PRUs are covered. Record the assessed section 100 applicability; selected screen, sector, ages or funding alone cannot establish it.",
    expectedEvidence: [
      "Risk-based allergy information and IHP decisions",
      "Staff awareness training and emergency/medicine-access arrangements",
      "Incident/near-miss review and updates to policy/plans",
    ],
    sourceIds: ["eng-school-allergy-law", "eng-school-allergy-guidance"],
    signalKeys: ["medical"],
    allowsNotApplicable: false,
    notApplicablePolicy: null,
  }),
  englandRequirement({
    id: "eng-independent-pupil-firstaid",
    action:
      "Draw up and effectively implement a written first-aid policy so pupils receive timely and competent first aid.",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: independentSchool,
    applicabilityExplanation:
      "Independent-school proprietor duty under ISS Schedule paragraph 13, distinct from employer first-aid duties. ACE status does not create an exemption.",
    unknownExplanation:
      "Confirm actual independent-school status; employee first-aid cover does not replace this pupil duty. EYFS paediatric-first-aid duties are separate.",
    expectedEvidence: [
      "Implemented written pupil first-aid policy",
      "Assessed on-site/off-site cover, competence and equipment",
      "First-aid records and review of response arrangements",
    ],
    sourceIds: ["eng-school-firstaid-law"],
    signalKeys: ["medical"],
    allowsNotApplicable: false,
    notApplicablePolicy: null,
  }),
  englandRequirement({
    id: "eng-school-medical-scope",
    action:
      "Assess whether the organisation is subject to English school medical and allergy duties under Children and Families Act 2014 section 100.",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: null,
    applicabilityExplanation:
      "Applies as a classification review across sectors: legal school status follows actual provision, including PRUs, rather than the selected screen or government-funding label.",
    unknownExplanation:
      "Confirm actual legal category and section 100 applicability, including maintained-nursery, young-child and 16-to-19 academy exclusions; do not infer from integer ages or vertical.",
    expectedEvidence: [
      "Actual legal school type and appropriate-authority record",
      "Documented section 100 scope/exclusion decision",
      "Assessed applicability profile fact",
    ],
    sourceIds: ["eng-school-medical-law", "eng-school-allergy-law"],
    signalKeys: ["medical"],
    allowsNotApplicable: false,
    notApplicablePolicy: null,
  }),
];
