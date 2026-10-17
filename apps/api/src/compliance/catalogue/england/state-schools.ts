import type { Condition } from "../conditions";
import { independentSchool } from "./conditions";
import { englandRequirement } from "./shared";

const maintained: Condition = {
  field: "schoolCategory",
  op: "eq",
  value: "MAINTAINED",
};
const academy: Condition = {
  field: "schoolCategory",
  op: "eq",
  value: "ACADEMY",
};
const state: Condition = { any: [maintained, academy] };
const unknownCategory =
  "Confirm actual maintained-school or academy category and record the relevant legal subtype. Funding, ages and screen selection alone do not establish it.";
export const stateSchoolRequirements = [
  englandRequirement({
    id: "eng.maintained-operational-governance",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: maintained,
    action:
      "Maintain governing-body strategic oversight, a clerk, clear headteacher accountability and recorded delegated responsibilities.",
    applicabilityExplanation:
      "Governance regulation 6 sets core oversight, integrity and openness duties. Identify applicable federation or temporary-body arrangements; this action does not cover detailed financial compliance.",
    unknownExplanation: unknownCategory,
    expectedEvidence: [
      "Instrument of government, clerk appointment and delegation records",
      "Educational-performance oversight and decision minutes",
    ],
    sourceIds: ["eng-state-governance-roles", "eng-maintained-governance"],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng.academy-operational-governance",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: academy,
    action:
      "Identify the trust's current articles, funding agreement and delegated responsibilities; evidence fulfilment of applicable operational governance requirements.",
    applicabilityExplanation:
      "The Academy Trust Handbook effective 1 October 2026 binds through the funding agreement. This is an agreement-and-implementation assessment, not a claim that every recommendation is statute. Review the current must/should distinctions; detailed corporate finance remains outside scope.",
    unknownExplanation: unknownCategory,
    expectedEvidence: [
      "Current articles/agreement, trustee responsibilities and scheme of delegation",
      "Operational oversight records and applicable handbook requirements review",
    ],
    sourceIds: ["eng-state-academy-handbook", "eng-academy-governance"],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng.maintained-complaints",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: maintained,
    action:
      "Establish and publicise complaints procedures for the school and its community facilities, routing matters with separate statutory procedures appropriately.",
    applicabilityExplanation:
      "Education Act 2002 section 29(1)–(2) includes maintained nurseries via section 39. The nursery exclusion in section 29(4) concerns only off-site instruction under subsection (3), not complaints. Website publication has a separate scope.",
    unknownExplanation: unknownCategory,
    expectedEvidence: [
      "Adopted accessible procedure and publication/communication record",
      "Responsible staff and appropriate statutory-route signposting",
    ],
    sourceIds: ["eng-state-complaints-law", "eng-maintained-governance"],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng.academy-complaints-route",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: academy,
    action:
      "Confirm academy subtype and implement its complaints route; where ISS Part 7 applies, provide informal, written and independent-panel stages and prescribed records.",
    applicabilityExplanation:
      "Academies other than 16–19 academies must meet the applicable ISS complaints standard. For 16–19 academies an accessible procedure is recommended. Distinguish availability to parents from recommended website publication; actual legal subtype cannot be inferred from pupil ages.",
    unknownExplanation: unknownCategory,
    expectedEvidence: [
      "Subtype and applicable funding/legal basis",
      "Procedure, timescales, panel independence and restricted complaint/action register",
    ],
    sourceIds: [
      "eng-independent-school-standards",
      "eng-academy-governance",
      "eng-state-academy-publication",
    ],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng.maintained-curriculum",
    topic: "education_childcare",
    obligationClass: "STATUTORY_DUTY",
    condition: maintained,
    action:
      "Provide a balanced, broadly based curriculum; assess phase and implement the national curriculum and other required subjects where applicable, retaining lawful exceptions.",
    applicabilityExplanation:
      "Education Act 2002 sections 78–80 distinguish the universal balanced curriculum baseline, including maintained nurseries, from age/phase-specific national curriculum, religious education and relationships/health duties. Nursery-only provision is not required to teach all national curriculum subjects. Assess legal phases, withdrawal and disapplication rules.",
    unknownExplanation: unknownCategory,
    expectedEvidence: [
      "Phase/legal-scope assessment, implemented curriculum map and subject plans",
      "Lawful exception or withdrawal evidence and SEN adaptations",
    ],
    sourceIds: [
      "eng-state-balanced-curriculum",
      "eng-state-basic-curriculum",
      "eng-maintained-governance",
    ],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng.academy-curriculum",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: academy,
    action:
      "Identify the academy's legal subtype and funding requirements and implement the applicable curriculum and assessment duties.",
    applicabilityExplanation:
      "Current Academies Act section 1A(1)(b) requires a broad and balanced curriculum for its mainstream academy-school route; special, alternative-provision and 16–19 routes differ. The substantive national-curriculum amendment in CWS Act 2026 section 54 is not yet commenced at this review; do not impose it prematurely.",
    unknownExplanation: unknownCategory,
    expectedEvidence: [
      "Subtype decision and funding curriculum clauses",
      "Implemented curriculum/assessment map, adaptations and exceptions",
    ],
    sourceIds: ["eng-state-academy-curriculum", "eng-academy-governance"],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng.state-send-support-assessment",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: state,
    action:
      "Determine and fulfil applicable SEN support, SENCO and SEN information-report duties, recording the institution's legal subtype and any exception.",
    applicabilityExplanation:
      "CFA sections 66–69 have different scopes: best endeavours includes mainstream schools, maintained nurseries, 16–19/AP academies and PRUs; SENCO duty covers mainstream schools and maintained nurseries. SEN reports cover maintained schools/nurseries and Academy schools, with hospital-special-school exceptions. Regulations 51–52 require specified content and website publication. Check SENCO qualification/cohort exemptions; not every established SENCO needs a new NPQ.",
    unknownExplanation: unknownCategory,
    expectedEvidence: [
      "Subtype/duty assessment and implemented SEN support",
      "SENCO appointment, qualification or exemption and applicable deadline",
      "SEN report, accessibility information and publication evidence",
    ],
    sourceIds: [
      "eng-state-send-support",
      "eng-state-senco",
      "eng-state-send-report",
      "eng-state-send-publication",
      "eng-state-senco-qualification",
    ],
    signalKeys: ["personnel"],
  }),
  englandRequirement({
    id: "eng.school-ehcp-admission-assessment",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: { any: [state, independentSchool] },
    action:
      "Assess the institution's scope under the named-EHC-plan admission duty and admit a child or young person when that duty applies.",
    applicabilityExplanation:
      "CFA section 43 lists maintained schools/nurseries, academies, non-maintained special schools and section 41-approved independent institutions. Both legal institutional scope and an actual naming decision matter; independent-school or ACE status alone does not establish approval or a duty to admit.",
    unknownExplanation:
      "Confirm legal school category, section 41 approval where relevant and any EHC-plan naming decision.",
    expectedEvidence: [
      "Legal-status/approval assessment",
      "Restricted EHC-plan naming and admission decisions",
    ],
    sourceIds: ["eng-state-ehcp-admission"],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng.maintained-publication-assessment",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: maintained,
    action:
      "Determine and fulfil applicable operational website-publication and update requirements; record phase and legal-category exclusions.",
    applicabilityExplanation:
      "The amended School Information regulations require website information, free paper copies on request and timely updates within their scope. The Part 4 definition excludes maintained nurseries and hospital special schools, which may still owe separate complaints and SEN-report duties. Assess current curriculum, contacts, inspection, complaints and phase-specific information; do not apply obsolete assessment metrics from original legislation.",
    unknownExplanation: unknownCategory,
    expectedEvidence: [
      "Applicable-information register and public URL/date checks",
      "Subtype/phase exclusions and update responsibility; separate SEN/complaints evidence",
    ],
    sourceIds: [
      "eng-state-web-publication",
      "eng-state-web-complaints",
      "eng-state-send-publication",
    ],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng.academy-publication-assessment",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: academy,
    action:
      "Identify and fulfil the academy's applicable operational publication duties under law and funding terms, distinguishing recommendations.",
    applicabilityExplanation:
      "DfE guidance separates statutory, funding-agreement and recommended publication. Review contacts, curriculum, admissions, complaints availability, governance, inspection and SEND information for the actual subtype. Do not label every should as statute; detailed financial publications remain outside this checklist version.",
    unknownExplanation: unknownCategory,
    expectedEvidence: [
      "Publication register with legal/contractual basis and subtype exclusions",
      "Live URL/date checks, owner and update record",
    ],
    sourceIds: ["eng-state-academy-publication", "eng-state-academy-handbook"],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng.state-admissions-assessment",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: state,
    action:
      "Identify the admission authority and applicable admissions route; perform its arrangements, application and appeal responsibilities or implement the responsible authority's decisions.",
    applicabilityExplanation:
      "Under SSFA section 88 the local authority normally determines community/voluntary-controlled admissions unless delegated; foundation/voluntary-aided governing bodies and academy-school proprietors are authorities. The admissions codes do not cover special academies, AP or standalone 16–19 settings; nursery admission is not automatically the primary-school route. Assess scope before applying Code timelines.",
    unknownExplanation: unknownCategory,
    expectedEvidence: [
      "Legal subtype, responsible authority and applicable admissions route",
      "Arrangements, consultation/determination/publication calendar and application/appeal process",
    ],
    sourceIds: [
      "eng-state-admission-authority",
      "eng-state-admission-arrangements",
      "eng-state-admissions-code",
      "eng-state-academy-publication",
    ],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng.state-local-authority-cooperation",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: state,
    action:
      "Assess and discharge current duties to cooperate with the local authority on admissions and decisions foreseeably affecting sufficient education provision.",
    applicabilityExplanation:
      "CWS Act section 61 is in force from 29 June 2026. SSFA section 85ZA concerns respective admission functions. EA section 19B concerns foreseeable impacts on local-authority education duties and lists relevant schools, including AP academies and PRUs but not maintained nurseries or 16–19 academies as such. Establish subtype and decision impact before applying each branch.",
    unknownExplanation: unknownCategory,
    expectedEvidence: [
      "Scope assessment and local-authority liaison responsibility",
      "Relevant decision-impact assessment and cooperation correspondence",
    ],
    sourceIds: ["eng-state-la-cooperation"],
    signalKeys: [],
  }),
];
