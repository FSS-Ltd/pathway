import { englandRequirement } from "./shared";

export const premisesDetailRequirements = [
  englandRequirement({
    id: "eng-detail-asbestos",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: {
      any: [
        { field: "controlsPremises", op: "eq", value: true },
        { field: "employsStaff", op: "eq", value: true },
      ],
    },
    action:
      "Determine asbestos dutyholders and maintenance responsibilities; obtain a suitable premises assessment and implement required management, information and review arrangements.",
    applicabilityExplanation:
      "Contractual repair obligations and actual control determine dutyholder extent. Record assessments/reviews; where asbestos is present or presumed, implement a written management plan and inform potential disturbers and emergency services. This scope assessment is recommended; the resulting regulation 4 duties are statutory. Do not assume asbestos requires removal or a universal annual statutory inspection.",
    unknownExplanation:
      "Confirm employment/premises control and the actual equipment, hazards and responsible dutyholders. Unresolved scope or unfinished required actions prevent confirmation.",
    expectedEvidence: [
      "Lease/control allocation and competent assessment or supported absence conclusion",
      "Applicable register/management plan, contractor information and completed remedial actions",
    ],
    sourceIds: ["eng-detail-asbestos"],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng-detail-legionella",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: {
      any: [
        { field: "controlsPremises", op: "eq", value: true },
        { field: "employsStaff", op: "eq", value: true },
      ],
    },
    action:
      "Assess water-system legionella risks and responsibility; implement proportionate controls, monitoring and review.",
    applicabilityExplanation:
      "Employers and premises controllers must understand and manage risks. A simple assessment may establish low risk; do not infer universal sampling, purchased certification or identical flushing intervals. Confirm actual systems, control and specialist needs before confirming completion.",
    unknownExplanation:
      "Confirm employment/premises control and the actual equipment, hazards and responsible dutyholders. Unresolved scope or unfinished required actions prevent confirmation.",
    expectedEvidence: [
      "Water-system and responsibility assessment",
      "Risk-based control/monitoring arrangements and completed corrective actions",
    ],
    sourceIds: ["eng-detail-legionella"],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng-detail-electrical",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: { field: "employsStaff", op: "eq", value: true },
    action:
      "Maintain electrical systems and equipment under the organisation’s control to prevent danger, with competent, risk-based maintenance and remedial action.",
    applicabilityExplanation:
      "Confirmed employer: duties apply within its control and require prevention of danger so far as reasonably practicable. Inspection/testing follows actual risk; there is no universal annual PAT, labelling or PAT-record duty. Fixed installations require their own suitable arrangements.",
    unknownExplanation:
      "Confirm employment/premises control and the actual equipment, hazards and responsible dutyholders. Unresolved scope or unfinished required actions prevent confirmation.",
    expectedEvidence: [
      "Responsibility and risk-based maintenance arrangements",
      "Competence evidence and completed defect isolation/repair records",
    ],
    sourceIds: ["eng-detail-electricity", "eng-detail-pat"],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng-detail-gas",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: {
      any: [
        { field: "controlsPremises", op: "eq", value: true },
        { field: "employsStaff", op: "eq", value: true },
      ],
    },
    action:
      "Identify gas installations and dutyholders; maintain relevant systems safely and fulfil any applicable landlord inspection duties.",
    applicabilityExplanation:
      "Assess gas presence, workplace control and any separate landlord role. Use appropriately qualified contractors; an annual landlord gas check is not a universal commercial-premises servicing interval. Record a supported no-gas finding where relevant rather than assuming every site needs a certificate.",
    unknownExplanation:
      "Confirm employment/premises control and the actual equipment, hazards and responsible dutyholders. Unresolved scope or unfinished required actions prevent confirmation.",
    expectedEvidence: [
      "Gas inventory or supported absence finding and responsibility allocation",
      "Applicable service, repair, contractor competence and landlord-check evidence",
    ],
    sourceIds: ["eng-detail-gas", "eng-detail-gas-landlord"],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng-detail-coshh",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: { field: "employsStaff", op: "eq", value: true },
    action:
      "Identify hazardous substances and exposure-producing work; implement required COSHH assessments, controls, information and review before exposure work.",
    applicabilityExplanation:
      "This screening action is recommended; regulation 6 duties arise for work liable to expose employees to hazardous substances. Include generated dust/fumes and biological risks, not only labelled chemicals. A safety data sheet alone is not the assessment. Five-plus employees triggers recording significant findings/control steps.",
    unknownExplanation:
      "Confirm employment/premises control and the actual equipment, hazards and responsible dutyholders. Unresolved scope or unfinished required actions prevent confirmation.",
    expectedEvidence: [
      "Substance/process inventory and assessment, including supported absence of relevant exposure",
      "Implemented controls, staff information and risk-based monitoring/review actions",
    ],
    sourceIds: ["eng-detail-coshh"],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng-detail-equipment",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: {
      any: [
        { field: "controlsPremises", op: "eq", value: true },
        { field: "employsStaff", op: "eq", value: true },
      ],
    },
    action:
      "Identify work equipment and responsible controllers; implement suitable safe use, maintenance, inspection and training, assessing separate lifting-equipment duties where relevant.",
    applicabilityExplanation:
      "This is a scope assessment, not a claim that every toy is work equipment. Actual work use and control determine PUWER duties; inspection depends on installation and deterioration risks. Lifting equipment needs its separate examination assessment; do not invent one interval for all equipment.",
    unknownExplanation:
      "Confirm employment/premises control and the actual equipment, hazards and responsible dutyholders. Unresolved scope or unfinished required actions prevent confirmation.",
    expectedEvidence: [
      "Work-equipment inventory and responsibility/suitability assessment",
      "Implemented guarding, maintenance, inspection and training; applicable specialist examination evidence",
    ],
    sourceIds: ["eng-detail-puwer"],
    signalKeys: [],
  }),
];
