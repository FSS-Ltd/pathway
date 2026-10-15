import { englandRequirement } from "./shared";
import { independentSchool, stateSchool } from "./conditions";
export const registrationRequirements = [
  englandRequirement({
    id: "eng.provider-classification",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Document the site's actual school/childcare classification, registration route and any substantiated exemption before opening or changing provision.",
    applicabilityExplanation:
      "All institutional sectors can provide regulated education or childcare. Assess ages, actual hours/content, compulsory-school-age pupil numbers and relevant EHC/looked-after status; learning-centre or ACE branding creates no exemption. Eighteen hours is an indicator, not a safe harbour.",
    unknownExplanation:
      "The classification assessment remains necessary when legal provider status is unknown.",
    expectedEvidence: [
      "Dated whole-provision classification assessment and regulator advice where uncertain",
      "Registration decision/approved details or evidenced exemption; do not upload identifiable pupil case details",
    ],
    sourceIds: ["eng-registration-guidance", "eng-childcare-exemptions"],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng.independent-registration",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: independentSchool,
    action:
      "Obtain and retain DfE independent-school registration before operating a qualifying independent school.",
    applicabilityExplanation:
      "Actual independent schools require registration. The definition includes full-time education for five compulsory-school-age pupils, or one with an EHC plan or looked-after status, subject to statutory exclusions. A pending application is insufficient; ACE/ICCE registration is separate.",
    unknownExplanation:
      "Confirm actual school status and statutory threshold facts; selected screens and funding labels do not establish them.",
    expectedEvidence: [
      "DfE registration decision, number and approved provision",
      "Classification and threshold assessment without disclosing restricted pupil records",
    ],
    sourceIds: ["eng-unregistered-school-law", "eng-registration-guidance"],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng.independent-material-change",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: independentSchool,
    action:
      "Obtain required prior approval for material changes and maintain accurate registered details.",
    applicabilityExplanation:
      "For registered independent schools, assess changes to proprietor, premises, pupil ages/capacity, entry gender, boarding and SEN admissions. This DfE route does not apply to academies or free schools.",
    unknownExplanation:
      "Confirm independent-school status and whether a proposed change affects registered details.",
    expectedEvidence: [
      "Current registered details, change assessment and prior approval where required",
      "Implementation dates and notification/approval correspondence",
    ],
    sourceIds: ["eng-material-change"],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng.independent-leadership",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: independentSchool,
    action:
      "Ensure independent-school leadership has appropriate skills and knowledge, fulfils its responsibilities and actively promotes pupils' wellbeing.",
    applicabilityExplanation:
      "ISS paragraph 34 concerns actual leadership and management, regardless of the curriculum or selected product type.",
    unknownExplanation:
      "Confirm whether the institution is subject to independent-school standards.",
    expectedEvidence: [
      "Named accountable proprietor/leaders, responsibilities and competence review",
      "Standards monitoring, inspection findings and completed remedial actions",
    ],
    sourceIds: ["eng-independent-school-standards"],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng.independent-parent-information-complaints",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: independentSchool,
    action:
      "Provide prescribed parent information and operate a written complaints procedure with informal, formal and independent-member panel stages.",
    applicabilityExplanation:
      "ISS paragraphs 32–33 specify information, timescales, panel arrangements, confidentiality and records. Record complaints and actions even where no panel hearing occurs; keep inspector access and required inspection/action-plan information available.",
    unknownExplanation:
      "Establish whether independent-school information and complaints standards apply.",
    expectedEvidence: [
      "Information/publication review and accessible current complaints procedure",
      "Restricted complaint/outcome/action records and panel independence arrangements",
    ],
    sourceIds: ["eng-independent-school-standards"],
    signalKeys: ["agreements"],
  }),
  englandRequirement({
    id: "eng.state-school-governance-classification",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: stateSchool,
    action:
      "Confirm maintained-school or academy status and document the applicable governance, admissions, complaints and publication responsibilities.",
    applicabilityExplanation:
      "State-school duties vary by subtype and delegation. Establish the governing body/trust, instrument or funding agreement and admissions authority; public funding alone does not establish these responsibilities. This assessment does not replace the subtype-specific duties.",
    unknownExplanation:
      "Confirm actual school status and subtype; a Public Learning Centre is not automatically state-funded or a state school.",
    expectedEvidence: [
      "School category, governance/funding instrument and delegated responsibility map",
      "Current official subtype guidance and documented gaps requiring specialist/local review",
    ],
    sourceIds: ["eng-maintained-governance", "eng-academy-governance"],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng.childcare-registration-assessment",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: { field: "childcare", op: "eq", value: true },
    action:
      "Determine the required childcare register and obtain registration, or substantiate the precise exemption for the whole provision.",
    applicabilityExplanation:
      "Under-eight care, duration, activities and provider circumstances affect registration. School, activity and temporary exemptions have specific conditions; neither a church/club label nor one activity establishes exemption. Record required notices and continuing register conditions.",
    unknownExplanation:
      "Confirm whether childcare is provided and assess ages, duration, activities and exemptions with Ofsted where uncertain.",
    expectedEvidence: [
      "Whole-provision assessment, registration/conditions or documented exemption",
      "Required advance notices and regulator advice for borderline provision",
    ],
    sourceIds: ["eng-childcare-exemptions"],
    signalKeys: [],
  }),
];
