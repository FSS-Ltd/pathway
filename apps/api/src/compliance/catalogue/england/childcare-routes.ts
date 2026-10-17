import { englandRequirement, englandSource } from "./shared";
import { earlyYears } from "./conditions";

const currentGuidance = {
  from: null,
  to: null,
  currentAsOf: "2026-10-15",
  unknownReason:
    "Current regulator guidance verified; the underlying register provisions and individual registration conditions have distinct dates.",
};
export const childcareRouteSources = [
  englandSource({
    id: "eng-childcare-register-compulsory",
    url: "https://www.gov.uk/guidance/daycare-providers-on-the-compulsory-childcare-register-ofsted-requirements",
    title:
      "Daycare providers on the compulsory Childcare Register: requirements",
    authority: "Ofsted",
    provision:
      "Provider-specific continuing registration, welfare, suitability, records, complaints and notification requirements",
    classification: "GUIDANCE",
    publishedAt: "2022-08-09",
    publishedDateUnknownReason: null,
    effective: currentGuidance,
  }),
  englandSource({
    id: "eng-childcare-register-voluntary",
    url: "https://www.gov.uk/guidance/daycare-providers-on-the-voluntary-childcare-register-ofsted-requirements",
    title:
      "Daycare providers on the voluntary Childcare Register: requirements",
    authority: "Ofsted",
    provision:
      "Continuing requirements while voluntarily registered; distinguish from compulsory registration and EYFS",
    classification: "GUIDANCE",
    publishedAt: "2022-08-09",
    publishedDateUnknownReason: null,
    effective: currentGuidance,
  }),
  englandSource({
    id: "eng-early-years-entitlements-2026",
    url: "https://www.gov.uk/government/publications/early-education-and-childcare--2/early-education-and-childcare-valid-from-1-april-2026",
    title: "Early education and childcare: valid from 1 April 2026",
    authority: "Department for Education",
    provision:
      "Local-authority statutory guidance: A1 charging/transparency, A3 quality and A4 provider arrangements; provider duties require actual local agreement",
    classification: "GUIDANCE",
    publishedAt: null,
    publishedDateUnknownReason:
      "Edition application date is verified, not its original publication day.",
    effective: { from: "2026-04-01", to: null, unknownReason: null },
  }),
];
export const childcareRouteRequirements = [
  englandRequirement({
    id: "eng.childcare-register-conditions",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: { field: "childcare", op: "eq", value: true },
    action:
      "Identify each applicable Childcare Register part and implement its continuing conditions, records and notification requirements.",
    applicabilityExplanation:
      "Compulsory, voluntary and Early Years registration are distinct. Compare the actual registration certificate and provider type with the relevant requirements; voluntary registration still has conditions while held. Record welfare, suitable staff, first aid, premises, insurance, complaints, parent information and required notifications. An exemption from compulsory registration does not establish exemption from all duties. This assessment does not impose every register's rules on every childcare provider.",
    unknownExplanation:
      "Confirm childcare provision, registered provider type, register parts and any exemptions; a nursery screen does not establish these facts.",
    expectedEvidence: [
      "Certificate/URN and register/provider-type assessment, or evidenced exemption",
      "Conditions matrix, relevant policies and restricted records, notification receipts and completed inspection actions",
    ],
    sourceIds: [
      "eng-childcare-register-compulsory",
      "eng-childcare-register-voluntary",
      "eng-childcare-exemptions",
    ],
    signalKeys: ["personnel", "medical", "agreements"],
  }),
  englandRequirement({
    id: "eng.funded-early-years-agreement",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: {
      any: [{ field: "childcare", op: "eq", value: true }, earlyYears],
    },
    action:
      "Assess participation in funded early-years entitlements and fulfil the applicable local agreement, eligibility, access and parent-information requirements.",
    applicabilityExplanation:
      "The statutory guidance addresses local authorities; provider responsibilities depend on actual arrangements. Private providers may offer funded places, so funding labels alone cannot select this route. Where participating, check eligibility/declarations, free-place access, optional extras and reasonable alternatives, transparent charges, quality, SEND and safeguarding terms. Record non-participation when appropriate. Local authority maintained-school arrangements have distinct provisions; the model agreement is not automatically a signed contract.",
    unknownExplanation:
      "Confirm actual early-years entitlement participation and the current local arrangement; do not infer it from sector or public/private funding labels.",
    expectedEvidence: [
      "Participation conclusion and current local agreement/arrangement with applicable conditions",
      "Eligibility and attendance reconciliation, accessible parent terms and charge breakdown, optional-extra alternatives and completed quality actions",
    ],
    sourceIds: ["eng-early-years-entitlements-2026"],
    signalKeys: ["attendance", "agreements"],
  }),
];
