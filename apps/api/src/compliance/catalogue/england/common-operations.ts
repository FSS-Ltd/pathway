import { englandRequirement } from "./shared";

export const commonOperationsRequirements = [
  englandRequirement({
    id: "eng-common-riddor",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Assess RIDDOR responsibility and reportability; make required reports promptly and retain required records.",
    applicabilityExplanation:
      "Assess across sectors even without employees: undertaking/premises responsibility can apply. Reporting depends on work connection, event type and exceptions, not every injury or hospital visit. Most qualifying events require notification without delay and a report within ten days; over-seven-day routine-work incapacity uses a fifteen-day route. Qualifying disease is reported on diagnosis. Over-three-day incapacity also requires records; exclude the accident day when counting. Keep required records at least three years from entry. Other regulator notifications remain separate.",
    unknownExplanation:
      "Identify the responsible person and actual event criteria. Unknown responsibility or unresolved reportability does not complete this assessment.",
    expectedEvidence: [
      "Responsible-person assessment and incident escalation/reporting procedure",
      "Restricted incident classification, required reports and acknowledgements, and record-retention arrangements; readiness evidence where no reportable event occurred",
    ],
    sourceIds: [
      "eng-common-riddor-responsibility",
      "eng-common-riddor-worker",
      "eng-common-riddor-nonworker",
      "eng-common-riddor-records",
      "eng-common-riddor-types",
      "eng-common-riddor-timing",
    ],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng-common-equality",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Assess equality duties for actual services, education and membership activities; remove unlawful barriers and implement required reasonable adjustments.",
    applicabilityExplanation:
      "Identify the legal route for each activity, including free services. School, public-service and qualifying association duties differ; sector, faith, funding and charity labels do not settle scope or exemptions. Adjustments are anticipatory under the relevant route; no current disabled users is not an exemption. School-pupil adjustments cover practices and auxiliary aids, not the physical-feature branch; retain separate school accessibility planning. Association status generally requires at least 25 members and regulated selection. Assess lawful exceptions specifically; do not assume every protected characteristic has identical protection across routes.",
    unknownExplanation:
      "Confirm actual activities, legal category, responsible body and applicable adjustments. Unresolved barriers or route uncertainty are not completion.",
    expectedEvidence: [
      "Activity-specific legal-route assessment and accessible admissions/service/adjustment process",
      "Barrier assessment, reasons for adjustment decisions, implemented support and review on change; protected evidence links rather than disability diagnoses in checklist notes",
    ],
    sourceIds: [
      "eng-common-equality-adjustments",
      "eng-common-equality-services",
      "eng-common-equality-boundaries",
      "eng-common-equality-schools",
      "eng-common-equality-education-adjustments",
      "eng-common-equality-associations",
      "eng-common-equality-code",
    ],
    signalKeys: [],
  }),
];
