import { englandRequirement } from "./shared";

export const activityDetailRequirements = [
  englandRequirement({
    id: "eng-detail-private-fostering",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Assess involvement in arranging host-family or other private accommodation for children; fulfil any applicable private-fostering notification duties.",
    applicabilityExplanation:
      "Screen across sectors even without campus boarding or trips: involvement in arranging can trigger duties. Scope depends on age, relationship, home accommodation, duration/intention and statutory exceptions. Under-16s (under-18 if disabled) can qualify; the less-than-28-day exclusion also requires no longer intention. Do not wait 28 days to assess. Proposed carers notify at least six weeks ahead or immediately if sooner; arrangers notify as soon as possible after arranging.",
    unknownExplanation:
      "Confirm actual activities, responsible operator and authority route. Complete the assessment and all resulting required actions before confirming; unknown scope or a pending permission is not completion.",
    expectedEvidence: [
      "Involvement assessment, including supported absence of arrangements; restricted duration/relationship/exemption decisions",
      "Actual children’s-services contact and required notification receipts; no child details in general checklist notes",
    ],
    sourceIds: ["eng-detail-fostering-scope", "eng-detail-fostering-notice"],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng-detail-adventure",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Screen on-site and off-site activities for adventure-licensing duties; verify required provider licences and suitable safety arrangements.",
    applicabilityExplanation:
      "Assessment applies across sectors even without trips. Specified activities, under-18 participants, payment and exemptions determine licensing. Own-pupil school provision and qualifying voluntary-association provision differ from commercial provision; charity alone is no exemption. Parent exemption requires actual parent/legal guardian involvement. A licence must exist before licensable provision.",
    unknownExplanation:
      "Confirm actual activities, responsible operator and authority route. Complete the assessment and all resulting required actions before confirming; unknown scope or a pending permission is not completion.",
    expectedEvidence: [
      "Activity/provider/participant and exemption assessment, or supported absence of relevant activities",
      "Current required licence scope/expiry and safety/emergency arrangements",
    ],
    sourceIds: ["eng-detail-adventure"],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng-detail-premises-permissions",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Verify lawful premises use and proposed works with the appropriate authority; obtain required approvals, fulfil conditions and retain completion evidence.",
    applicabilityExplanation:
      "Screen actual premises use across sectors, including hired premises. Planning permission and building-regulations approval are separate; educational registration settles neither. Confirm duty allocation, use/works, exemptions and approval route with the actual authority. No universal planning application is inferred.",
    unknownExplanation:
      "Confirm actual activities, responsible operator and authority route. Complete the assessment and all resulting required actions before confirming; unknown scope or a pending permission is not completion.",
    expectedEvidence: [
      "Site address, authority and use/works assessment",
      "Required permissions, conditions, building-control completion and landlord consent where applicable",
    ],
    sourceIds: ["eng-detail-planning", "eng-detail-building"],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng-detail-venue-licensing",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Screen venue and event activities for licensing requirements and exemptions; obtain required authorisations and implement their conditions.",
    applicabilityExplanation:
      "Actual alcohol, entertainment or late-night refreshment activities, hours and exemptions determine the route. Charity status does not automatically exempt a venue. Assess premises licences, club certificates or temporary-event routes with the actual licensing authority; do not require a licence for every educational or incidental activity.",
    unknownExplanation:
      "Confirm actual activities, responsible operator and authority route. Complete the assessment and all resulting required actions before confirming; unknown scope or a pending permission is not completion.",
    expectedEvidence: [
      "Activity/hours/venue and exemption assessment, including supported absence of licensable activity",
      "Required authority decision, licence/notice and condition-review evidence",
    ],
    sourceIds: ["eng-detail-licensing", "eng-detail-temporary-events"],
    signalKeys: [],
  }),
];
