import type { CatalogueRequirement } from "../schema";
import { school } from "./conditions";
import { englandRequirement } from "./shared";

const maintained: CatalogueRequirement["condition"] = {
  field: "schoolCategory",
  op: "eq",
  value: "MAINTAINED",
};
const stateCategory: CatalogueRequirement["condition"] = {
  any: [maintained, { field: "schoolCategory", op: "eq", value: "ACADEMY" }],
};
function assessment(
  input: Pick<
    CatalogueRequirement,
    | "id"
    | "topic"
    | "action"
    | "condition"
    | "applicabilityExplanation"
    | "expectedEvidence"
    | "sourceIds"
  >,
): CatalogueRequirement {
  return englandRequirement({
    ...input,
    obligationClass: "RECOMMENDATION",
    unknownExplanation:
      "Confirm actual school classification and the relevant institution, pupil or procedural facts. Screens, funding and age ranges alone cannot establish the route; retain unresolved facts for review.",
    signalKeys: [],
  });
}
export const schoolProcedureRequirements: CatalogueRequirement[] = [
  assessment({
    id: "eng.maintained-constitution-procedure",
    topic: "registration_governance",
    action:
      "Check the governing body's constitution, election arrangements and decision-making procedures.",
    condition: maintained,
    applicabilityExplanation:
      "This procedural assessment supplements strategic governance oversight. Establish standalone or federation status and the actual instrument of government. For standalone maintained schools, regulation 13 sets minimum membership, parent/staff/LA/head categories and the staff proportion; foundation/voluntary rules add requirements. Apply the proper election authority, contested ballot, postal voting opportunity and restricted appointment fallback. Maintained nursery schools are included. Meetings require the applicable frequency and quorum: regulation 14 uses half of filled membership rounded up, with particular decision rules. Federations require their own regulations; do not impose standalone composition, or maintained numbers on academy trusts.",
    expectedEvidence: [
      "Current instrument and federation/subtype assessment; membership, terms, eligibility and appointment authority; election notices and voting arrangements; meeting calendar, attendance, quorum calculation and decision records. Resolve federation-specific rules before confirmation.",
    ],
    sourceIds: [
      "eng-procedure-constitution",
      "eng-procedure-elections",
      "eng-procedure-quorum",
      "eng-procedure-governance-guide",
    ],
  }),
  assessment({
    id: "eng.school-admission-appeals-procedure",
    topic: "registration_governance",
    action:
      "Identify the admission-appeal route and responsible authority, then maintain the required independent appeal arrangements.",
    condition: stateCategory,
    applicabilityExplanation:
      "This assessment supplements admission-arrangement determination. The 2022 Appeals Code applies to appeals lodged from 1 October 2022, excluding special schools, alternative provision and standalone 16–19 provision. Identify the actual admission authority: ordinarily the LA for community/voluntary-controlled schools, governing body for foundation/voluntary-aided schools, and trust for academies through their funding agreement and any variation. Delegation does not remove responsibility. Where applicable, provide independent trained panels and clerk, publish the timetable by 28 February, allow at least 20 school days to lodge and 10 school days hearing notice, and apply the correct normal-round, late, in-year or sixth-form timescale, decisions and records. Infant class size has distinct decision rules. EHCP placement disputes follow a different route; private independent schools do not automatically enter this Code.",
    expectedEvidence: [
      "Legal subtype, admission authority and delegation/agreement evidence; applicable route or substantiated exclusion; published timetable, panel eligibility/training, independent clerk and anonymised notice/decision/record controls. Preserve the correct historical Code for earlier appeals.",
    ],
    sourceIds: ["eng-procedure-appeals"],
  }),
  assessment({
    id: "eng.curriculum-exception-procedure",
    topic: "education_childcare",
    action:
      "Identify any curriculum modification or disapplication and verify its exact legal authority, scope and review arrangements.",
    condition: maintained,
    applicabilityExplanation:
      "This assessment supplements ordinary curriculum delivery; it does not require an exception. Education Act 2002 section 90 requires an actual Secretary of State direction for development or experiments. Section 91 is an enabling power, not an individual exemption. Section 92 requires the EHC plan itself to specify the exclusion or modification; SEND or an EHC plan alone does not disapply the curriculum. Sections 93–94 permit temporary headteacher directions only within prescribed circumstances and conditions, with notifications, reasons, alternative provision and reintegration or assessment arrangements. The six-month statutory ceiling is not automatic permission. Verify the current implementing regulations and exact direction before use; separately establish whether assessment arrangements are affected.",
    expectedEvidence: [
      "Documented non-use or actual statutory route, direction/EHC provision, prescribed-condition review, scope and duration, notification record, alternative educational provision and review/reintegration plan. Keep identifiable pupil plans in restricted records; unresolved implementing rules prevent confirmation.",
    ],
    sourceIds: [90, 91, 92, 93, 94].map(
      (section) => `eng-procedure-curriculum-${section}`,
    ),
  }),
  assessment({
    id: "eng.school-assessment-procedure",
    topic: "education_childcare",
    action:
      "Determine the 2026–27 national assessment route and evidence its administration, moderation, submissions and reporting.",
    condition: school,
    applicabilityExplanation:
      "Use the 2027 KS2 and phonics arrangements published 12 October 2026 for actual pupil stages, school type and participation. Maintained KS2 assessments are statutory; academy requirements depend on the agreement. Independent schools may elect end-KS2 subjects but cannot formally participate in MTC or phonics. PRU pupils registered elsewhere remain that school's responsibility; other PRU participation is not identical. Eligible maintained-nursery pupils can fall within phonics. Do not infer key stage solely from profile ages. End-KS1 tests remain optional, separate from phonics. Apply the actual participation/access decisions, secure administration, declarations, monitoring/moderation, submission and parent-reporting rules. KS2 agreement forms open 2 November following the 14 October operational update. Other phases and specialist routes require separate review.",
    expectedEvidence: [
      "Year-specific school/cohort and participation assessment, agreement or voluntary registration where relevant, responsible lead, assessment calendar and secure controls, access/non-participation rationale, moderation/monitoring agreement, declarations and submission/reporting proof. Record no relevant cohort with evidence rather than assume it from sector.",
    ],
    sourceIds: [
      "eng-procedure-ks2-2027",
      "eng-procedure-phonics-2027",
      "eng-procedure-optional-ks1",
    ],
  }),
];
