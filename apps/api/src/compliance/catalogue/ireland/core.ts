import type { CatalogueRequirement } from "../schema";
import { irelandCareCondition, irelandRequirement as action } from "./shared";

const independent = {
  field: "providerCategory",
  op: "eq",
  value: "INDEPENDENT_SCHOOL",
} as const;
const school: CatalogueRequirement["condition"] = {
  any: [
    { field: "providerCategory", op: "eq", value: "STATE_SCHOOL" },
    { field: "providerCategory", op: "eq", value: "INDEPENDENT_SCHOOL" },
  ],
};
const children = { field: "minimumAge", op: "lte", value: 17 } as const;

export const coreRequirements: CatalogueRequirement[] = [
  action({
    id: "irl.provider-classification",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Classify recognised or non-recognised school, early-years, school-age care and out-of-school activity before selecting Irish registration routes.",
    applicabilityExplanation:
      "ACE branding, funding and portal sector do not establish legal recognition or whether the activity is regulated childcare.",
    unknownExplanation:
      "Document ages, hours, teaching versus care, recognition and funding; seek Department of Education or Tusla advice where needed.",
    expectedEvidence: [
      "Provision assessment, recognition status, Tusla or department correspondence",
    ],
    sourceIds: [
      "irl-non-recognised-school",
      "irl-school-age-care",
      "irl-early-years-care",
    ],
    signalKeys: [],
  }),
  action({
    id: "irl.non-recognised-school-families",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: independent,
    action:
      "Check whether families must register their children attending a non-recognised school with Tusla and inform them of that route.",
    applicabilityExplanation:
      "Education (Welfare) Act 2000 section 14 places this registration duty on parents, not automatically on the private school provider.",
    unknownExplanation:
      "Confirm whether the school is non-recognised and whether each family has the correct Tusla information.",
    expectedEvidence: [
      "Recognition assessment, family information and Tusla correspondence without exposing child details",
    ],
    sourceIds: ["irl-non-recognised-school"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Only where actual recognised status or another documented legal classification makes the parent registration route inapplicable.",
  }),
  action({
    id: "irl.tusla-care-registration",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: irelandCareCondition,
    action:
      "Register in-scope early-years or school-age childcare with Tusla before operating and maintain the applicable certificate.",
    applicabilityExplanation:
      "Tuition, sport or religious teaching alone can fall outside school-age care; actual care provision and exemptions determine the route.",
    unknownExplanation:
      "Confirm early-years versus school-age service, ages, activities, exemptions and Tusla's registration decision.",
    expectedEvidence: [
      "Tusla service classification, application, certificate and renewal or documented exception",
    ],
    sourceIds: ["irl-school-age-care", "irl-early-years-care"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Only after documenting why actual activities are outside registrable childcare, with Tusla advice when uncertain.",
  }),
  action({
    id: "irl.child-safeguarding-statement",
    topic: "safeguarding",
    obligationClass: "STATUTORY_DUTY",
    condition: children,
    action:
      "Assess whether the site provides a Children First relevant service and, if so, maintain its child risk assessment and Child Safeguarding Statement.",
    applicabilityExplanation:
      "The Children First Act 2015 applies to providers of relevant services; an institution serving children should not infer an exemption from its screen set.",
    unknownExplanation:
      "Map services to Schedule 1 and confirm relevant-service status and local Tusla reporting contacts.",
    expectedEvidence: [
      "Relevant-service assessment, child risk assessment, published statement and review record",
    ],
    sourceIds: ["irl-children-first", "irl-children-first-act"],
    signalKeys: ["safeguarding"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Only after a documented Schedule 1 assessment establishes that no relevant service is provided; confirm with Tusla or local advice where uncertain.",
    reviewCadenceDays: 700,
    reviewCadenceBasis:
      "Portal reminder before the Children First Act 2015 section 11 maximum interval of 24 months; review sooner after material changes.",
  }),
  action({
    id: "irl.recognised-school-procedures",
    topic: "safeguarding",
    obligationClass: "STATUTORY_GUIDANCE",
    condition: school,
    action:
      "Use the recognised school's applicable child-protection procedures and plan formal adoption of the 2025 edition by 31 December 2026.",
    applicabilityExplanation:
      "The 2023 procedures remain until the school adopts the 2025 procedures; the department sets a December 2026 adoption deadline for recognised schools.",
    unknownExplanation:
      "Confirm school recognition, adoption status and the governing body's current procedures.",
    expectedEvidence: [
      "Adopted procedures, designated liaison role, board review and adoption decision",
    ],
    sourceIds: ["irl-school-child-protection"],
    signalKeys: ["safeguarding"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Only where documented non-recognised status confirms the Department's recognised-school procedures do not apply; Children First duties still require separate assessment.",
    reviewCadenceDays: 60,
    reviewCadenceBasis:
      "Planning reminder to confirm formal adoption of the 2025 school procedures before the Department's 31 December 2026 deadline.",
  }),
  action({
    id: "irl.garda-vetting",
    topic: "personnel",
    obligationClass: "STATUTORY_DUTY",
    condition: children,
    action:
      "Assess roles for relevant work and obtain a Garda vetting disclosure before allowing any person to perform in-scope work.",
    applicabilityExplanation:
      "The National Vetting Bureau Acts cover necessary and regular work mainly involving children; occasional assistance can be excluded after role assessment. A parent portal account is insufficient.",
    unknownExplanation:
      "Record actual duties, regularity, contact and the organisation's vetting route before deciding eligibility.",
    expectedEvidence: [
      "Role eligibility decisions, vetting-disclosure verification and review dates",
    ],
    sourceIds: ["irl-vetting", "irl-vetting-work", "irl-vetting-act"],
    signalKeys: ["personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Only when documented role analysis shows there is no relevant work or a statutory occasional-assistance exception applies; seek Bureau advice if uncertain.",
  }),
];
