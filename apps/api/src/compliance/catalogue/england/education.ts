import { englandRequirement } from "./shared";
import {
  independentSchool,
  stateSchool,
  school,
  earlyYears,
} from "./conditions";
export const educationRequirements = [
  englandRequirement({
    id: "eng.independent-curriculum",
    topic: "education_childcare",
    obligationClass: "STATUTORY_DUTY",
    condition: independentSchool,
    action:
      "Implement a written curriculum policy, schemes of work, effective teaching and assessment suited to pupils' ages, aptitudes and needs.",
    applicabilityExplanation:
      "ISS paragraphs 1–4 govern independent-school provision. Include required curriculum areas, PSHE, age-appropriate relationships/RSE and SEND adaptations. ACE resources or portal assessment counts do not establish compliance; the national curriculum is not universally required for private schools.",
    unknownExplanation:
      "Confirm actual independent-school status and pupils' provision/needs.",
    expectedEvidence: [
      "Curriculum policy, plans and schemes mapped to current standards",
      "Teaching/assessment reviews, adaptations and recorded improvement actions",
    ],
    sourceIds: ["eng-independent-school-standards"],
    signalKeys: ["ace"],
  }),
  englandRequirement({
    id: "eng.independent-smsc",
    topic: "education_childcare",
    obligationClass: "STATUTORY_DUTY",
    condition: independentSchool,
    action:
      "Promote pupils' spiritual, moral, social and cultural development and meet the political impartiality and balanced-presentation requirements.",
    applicabilityExplanation:
      "ISS paragraph 5 includes fundamental British values and balanced treatment of political issues, including external materials and activities. An ACE or faith ethos does not remove these standards.",
    unknownExplanation: "Confirm whether independent-school standards apply.",
    expectedEvidence: [
      "Curriculum/activity mapping, reviewed external materials and staff guidance",
      "Evidence of implementation and oversight",
    ],
    sourceIds: ["eng-independent-school-standards"],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng.state-curriculum-route",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: stateSchool,
    action:
      "Identify and implement the school's applicable curriculum, assessment and publication route using its maintained-school or academy status.",
    applicabilityExplanation:
      "Maintained-school and academy routes differ. Check current statutory curriculum, funding-agreement and phase-specific requirements; do not infer them from funding status or apply an independent-school screen's policy automatically. This route assessment does not replace specific curriculum duties.",
    unknownExplanation:
      "Confirm actual state-school status, subtype, phases and governing/funding documents.",
    expectedEvidence: [
      "Dated route/phase assessment, curriculum and assessment mapping",
      "Required published curriculum information and responsible governance review",
    ],
    sourceIds: [
      "eng-curriculum-overview",
      "eng-maintained-governance",
      "eng-academy-governance",
    ],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng.school-registers",
    topic: "education_childcare",
    obligationClass: "STATUTORY_DUTY",
    condition: school,
    action:
      "Maintain lawful electronic admission and attendance registers, amendment history, backups, retention, deletions and required returns.",
    applicabilityExplanation:
      "Regulations 5–13 require admission records and normally twice-daily attendance; all-boarder schools have an attendance-register exception. Back up at least monthly, retain entries for six years from entry and backups for six years after their school year. Deletions/returns have specific grounds and timings. Independent schools do not automatically owe DfE daily data submission.",
    unknownExplanation:
      "Confirm actual school status and boarding/attendance arrangements; portal attendance counts alone do not prove register or return compliance.",
    expectedEvidence: [
      "Electronic registers, correct codes and amendment audit trail",
      "Backup/retention proof, lawful deletion decisions and required local-authority returns",
    ],
    sourceIds: ["eng-school-registers"],
    signalKeys: ["attendance"],
  }),
  englandRequirement({
    id: "eng.school-attendance-support",
    topic: "education_childcare",
    obligationClass: "STATUTORY_GUIDANCE",
    condition: school,
    action:
      "Have regard to current attendance guidance and implement attendance leadership, policy, support and local-authority partnership.",
    applicabilityExplanation:
      "The current school attendance guidance applies to maintained, academy and independent schools, with responsibilities varying by school type. Use proportionate support and appropriate escalation rather than treating portal totals as proof of compliance.",
    unknownExplanation:
      "Confirm actual school status, local authority and current attendance responsibilities.",
    expectedEvidence: [
      "Named attendance lead and current published policy",
      "Support/oversight records, local-authority procedures and completed actions",
    ],
    sourceIds: ["eng-attendance-guidance"],
    signalKeys: ["attendance"],
  }),
  englandRequirement({
    id: "eng.school-relationships-education",
    topic: "education_childcare",
    obligationClass: "STATUTORY_GUIDANCE",
    condition: school,
    action:
      "Review age/phase-appropriate Relationships Education/RSE, policy, parent consultation and applicable withdrawal arrangements against September 2026 guidance.",
    applicabilityExplanation:
      "Primary Relationships Education and secondary RSE differ. Apply the guidance's phase/type provisions and exceptions; independent-school health education is addressed through ISS/PSHE rather than a blanket state-school health-education rule.",
    unknownExplanation:
      "Confirm school status, phases, ages and the applicable guidance provisions.",
    expectedEvidence: [
      "Current policy/curriculum mapping, consultation and accessible parent information",
      "Applicable withdrawal decisions and oversight",
    ],
    sourceIds: ["eng-rshe-guidance", "eng-independent-school-standards"],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng.eyfs-learning-assessment",
    topic: "education_childcare",
    obligationClass: "STATUTORY_DUTY",
    condition: earlyYears,
    action:
      "Implement applicable EYFS learning, development and assessment requirements, retaining evidence for any approved exemption.",
    applicabilityExplanation:
      "For confirmed group/school-based EYFS provision, map the framework's areas and assessments, including age-two progress checks and EYFS profile where applicable. Do not require every independent nursery to perform Reception Baseline Assessment. Learning/development exemptions do not remove welfare duties; childminders use a separate framework.",
    unknownExplanation:
      "Confirm the applicable EYFS/provider framework and any specific exemptions; age alone is insufficient.",
    expectedEvidence: [
      "Current framework mapping and development/assessment arrangements",
      "Applicable assessments, approved exemptions and parent communication",
    ],
    sourceIds: ["eng-eyfs-framework"],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng.eyfs-staffing-key-person",
    topic: "education_childcare",
    obligationClass: "STATUTORY_DUTY",
    condition: earlyYears,
    action:
      "Maintain age/provider-specific EYFS staffing ratios, competent supervision, qualification evidence and key-person arrangements.",
    applicabilityExplanation:
      "The group/school framework's staffing rules depend on children's ages, provider/teacher circumstances, staff qualifications and dates. There is no single universal ratio. Assess the actual rota and qualification eligibility, including applicable paediatric first-aid conditions.",
    unknownExplanation:
      "Confirm group/school EYFS scope and actual children, staff, qualifications and provision pattern.",
    expectedEvidence: [
      "Staffing/ratio and qualification assessment, current rosters and supervision arrangements",
      "Key-person allocation and coverage/contingency records",
    ],
    sourceIds: ["eng-eyfs-framework"],
    signalKeys: ["personnel"],
  }),
  englandRequirement({
    id: "eng.eyfs-parent-information-complaints",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: earlyYears,
    action:
      "Provide required EYFS parent information and complaints arrangements, investigate written EYFS complaints and communicate the outcome within 28 days.",
    applicabilityExplanation:
      "Apply the group/school framework's information, recordkeeping, complaint and regulator-access provisions. Retain written complaint/outcome records and make regulator contact/inspection information available; safeguarding notifications remain separate.",
    unknownExplanation:
      "Confirm applicable EYFS provision and responsible registered provider/regulator.",
    expectedEvidence: [
      "Current parent information and complaints procedure",
      "Restricted complaint/outcome records and evidence of required timescales/regulator access",
    ],
    sourceIds: ["eng-eyfs-framework"],
    signalKeys: ["agreements"],
  }),
];
