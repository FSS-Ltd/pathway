import type { CatalogueRequirement } from "../schema";
import { walesRequirement } from "./shared";
const employed = { field: "employsStaff", op: "eq", value: true } as const;
const school: CatalogueRequirement["condition"] = {
  any: [
    { field: "providerCategory", op: "eq", value: "INDEPENDENT_SCHOOL" },
    { field: "providerCategory", op: "eq", value: "STATE_SCHOOL" },
  ],
};
export const premisesRequirements: CatalogueRequirement[] = [
  walesRequirement({
    id: "wls-employer-risk",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: employed,
    action:
      "Assess and control risks to staff and people affected by the organisation's undertaking.",
    applicabilityExplanation:
      "The employer's regulation 3 assessment depends on actual employment, not institutional branding; recording thresholds and review triggers require separate assessment.",
    unknownExplanation:
      "Confirm whether the organisation employs staff and controls the relevant activity.",
    expectedEvidence: [
      "Current risk assessment, control owners and change review",
    ],
    sourceIds: ["wls-op-risk"],
    signalKeys: [],
  }),
  walesRequirement({
    id: "wls-employer-firstaid",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: employed,
    action:
      "Provide adequate first-aid arrangements for employees based on actual workplace needs.",
    applicabilityExplanation:
      "First-Aid Regulations regulation 3 applies to employers. Childcare and independent-school standards can add separate obligations.",
    unknownExplanation:
      "Confirm employment and relevant workplaces before applying the employer route.",
    expectedEvidence: [
      "First-aid needs assessment, equipment, competent cover and staff information",
    ],
    sourceIds: ["wls-op-firstaid"],
    signalKeys: ["personnel"],
  }),
  walesRequirement({
    id: "wls-safety-responsibilities",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Map health, safety and premises responsibilities for the site's actual activities and shared spaces.",
    applicabilityExplanation:
      "Landlord, employer, operator and volunteer arrangements can differ; the profile does not establish every legal responsible person.",
    unknownExplanation:
      "Resolve ownership and operation with relevant parties and authorities.",
    expectedEvidence: [
      "Responsibility map, agreements and local permission review",
    ],
    sourceIds: ["wls-op-risk", "wls-op-fire"],
    signalKeys: [],
  }),
  walesRequirement({
    id: "wls-fire-review",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: { field: "controlsPremises", op: "eq", value: true },
    action:
      "Identify the fire responsible person and verify a current fire assessment and precautions.",
    applicabilityExplanation:
      "Fire Safety Order duties depend on actual workplace/control and shared-premises arrangements; control flag starts a review but does not establish sole responsibility.",
    unknownExplanation:
      "Identify who controls the premises and any shared duties before confirming.",
    expectedEvidence: [
      "Responsible-person allocation, fire assessment, evacuation and review records",
    ],
    sourceIds: ["wls-op-fire"],
    signalKeys: [],
  }),
  walesRequirement({
    id: "wls-school-accessibility",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: school,
    action:
      "Maintain the accessibility planning required for the actual Welsh school responsible body.",
    applicabilityExplanation:
      "Equality Act Schedule 10 applies by legal school route; an ACE or learning-centre screen does not establish that route.",
    unknownExplanation:
      "Identify whether this is a school and its responsible body or statutory exception.",
    expectedEvidence: [
      "Accessibility plan or responsible-body strategy, review and reasonable-adjustment records",
    ],
    sourceIds: ["wls-op-equality"],
    signalKeys: [],
  }),
  walesRequirement({
    id: "wls-accessibility-review",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Assess disabled-access and reasonable-adjustment responsibilities for the site's services and premises.",
    applicabilityExplanation:
      "Education, service-provider and employment duties differ; identify the actual role rather than assuming a school plan covers all access duties.",
    unknownExplanation: "Confirm services, premises and relevant users.",
    expectedEvidence: [
      "Accessibility and adjustment assessment, action owners",
    ],
    sourceIds: ["wls-op-equality"],
    signalKeys: [],
  }),
  walesRequirement({
    id: "wls-healthcare-review",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Review healthcare and medical-support arrangements for actual learners and provider route.",
    applicabilityExplanation:
      "Welsh healthcare guidance addresses different education bodies and does not make England's school medical duty a Welsh test.",
    unknownExplanation:
      "Identify learner needs and the legal education provider.",
    expectedEvidence: [
      "Medical support policy and secure individual plans where applicable",
    ],
    sourceIds: ["wls-op-healthcare"],
    signalKeys: ["medical"],
  }),
];
