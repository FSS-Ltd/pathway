import type { CatalogueRequirement } from "../schema";
import { walesRequirement } from "./shared";
const independent = {
  field: "providerCategory",
  op: "eq",
  value: "INDEPENDENT_SCHOOL",
} as const;
const state = {
  field: "providerCategory",
  op: "eq",
  value: "STATE_SCHOOL",
} as const;
const childcare = { field: "childcare", op: "eq", value: true } as const;
export const educationRequirements: CatalogueRequirement[] = [
  walesRequirement({
    id: "wal.independent-education",
    topic: "education_childcare",
    obligationClass: "STATUTORY_DUTY",
    condition: independent,
    action:
      "Maintain the curriculum, teaching and assessment required by the Welsh independent-school standards.",
    applicabilityExplanation:
      "The independent-school standard is separate from Curriculum for Wales duties on maintained schools and funded nursery education.",
    unknownExplanation:
      "Confirm independent-school status and the school's approved age and pupil arrangements.",
    expectedEvidence: [
      "Curriculum policy, schemes of work and assessment review",
    ],
    sourceIds: ["wal-iss", "wal-school-registration"],
    signalKeys: [],
  }),
  walesRequirement({
    id: "wal.maintained-curriculum-route",
    topic: "education_childcare",
    obligationClass: "STATUTORY_GUIDANCE",
    condition: state,
    action:
      "Review and implement the Curriculum for Wales and assessment duties for the maintained school's actual ages and provision.",
    applicabilityExplanation:
      "Welsh maintained schools follow Welsh curriculum legislation and statutory guidance; private or ACE branding does not establish maintained status.",
    unknownExplanation:
      "Confirm the provider's maintained-school classification and covered age groups.",
    expectedEvidence: [
      "Curriculum and assessment design, published policy, age-route review",
    ],
    sourceIds: ["wal-curriculum"],
    signalKeys: [],
  }),
  walesRequirement({
    id: "wal.nursery-curriculum-assessment",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Assess whether funded non-maintained nursery education or another Welsh early-years curriculum route applies.",
    applicabilityExplanation:
      "A nursery sector or screen alone does not establish publicly funded places or a statutory curriculum route.",
    unknownExplanation:
      "Confirm funding agreement, age range and education-versus-care scope.",
    expectedEvidence: [
      "Funding and curriculum-route decision, commissioning terms if any",
    ],
    sourceIds: ["wal-curriculum"],
    signalKeys: [],
  }),
  walesRequirement({
    id: "wal.childcare-registration-assessment",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: childcare,
    action:
      "Assess CIW childcare registration, including current under-12, duration, frequency and exemption conditions.",
    applicabilityExplanation:
      "Actual childcare may need separate CIW registration, including childcare attached to a school. Do not treat a two-hour shorthand as a universal exemption; examine current Welsh exceptions and actual provision.",
    unknownExplanation:
      "Confirm ages, hours, frequency, school-day relationship and applicable exception before deciding.",
    expectedEvidence: [
      "Service schedule, age and exemption assessment, CIW decision or registration",
    ],
    sourceIds: ["wal-childcare-exceptions", "wal-school-registration"],
    signalKeys: [],
  }),
  walesRequirement({
    id: "wal.childcare-standards-assessment",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: childcare,
    action:
      "Assess the current 2026 Welsh minimum standards for any CIW-regulated childcare route.",
    applicabilityExplanation:
      "The standards and open-access play route depend on actual CIW registration and service type; the profile does not establish them.",
    unknownExplanation:
      "Verify whether this site is CIW registered and which standards apply.",
    expectedEvidence: [
      "CIW registration and service type, standards gap review and inspection actions",
    ],
    sourceIds: ["wal-childcare-standards"],
    signalKeys: [],
  }),
  walesRequirement({
    id: "wal.aln-route-assessment",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Assess Welsh additional-learning-needs and IDP responsibilities for the site's actual pupils and provider route.",
    applicabilityExplanation:
      "Maintained schools, local authorities, funded nurseries and independent schools have different ALN roles. An English EHCP label must not be substituted for the Welsh IDP route.",
    unknownExplanation:
      "Confirm pupils, funding/placement terms and responsible school or authority.",
    expectedEvidence: [
      "ALN responsibilities, referral and IDP decision arrangements, protected pupil records",
    ],
    sourceIds: ["wal-aln", "wal-school-registration"],
    signalKeys: [],
  }),
];
