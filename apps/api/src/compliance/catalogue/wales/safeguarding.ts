import type { CatalogueRequirement } from "../schema";
import { walesRequirement } from "./shared";
const school: CatalogueRequirement["condition"] = {
  any: [
    { field: "providerCategory", op: "eq", value: "INDEPENDENT_SCHOOL" },
    { field: "providerCategory", op: "eq", value: "STATE_SCHOOL" },
  ],
};
const children = { field: "minimumAge", op: "lte", value: 17 } as const;
export const safeguardingRequirements: CatalogueRequirement[] = [
  walesRequirement({
    id: "wal.school-safeguarding",
    topic: "safeguarding",
    obligationClass: "STATUTORY_GUIDANCE",
    condition: school,
    action:
      "Maintain Welsh school safeguarding arrangements, a named lead, staff procedures and a current child-protection policy.",
    applicabilityExplanation:
      "Keeping learners safe addresses Welsh local authorities, maintained governing bodies and independent-school proprietors. Actual school status is required.",
    unknownExplanation:
      "Confirm the legal school route; unresolved status must not default to England or waive safeguarding.",
    expectedEvidence: [
      "Safeguarding policy, lead designation, training and referral records with protected case details",
    ],
    sourceIds: ["wal-safeguarding-guidance", "wal-iss"],
    signalKeys: ["safeguarding", "personnel"],
  }),
  walesRequirement({
    id: "wal.community-safeguarding",
    topic: "safeguarding",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Review child-safeguarding arrangements for community, faith, club, nursery and learning-centre activities.",
    applicabilityExplanation:
      "Welsh Government's code states non-statutory expectations for groups offering activities or services. It does not make every group a regulated school or childcare provider.",
    unknownExplanation:
      "Establish whether children attend and identify the responsible local safeguarding route.",
    expectedEvidence: [
      "Role-appropriate policy, named contact, reporting and regional referral route",
    ],
    sourceIds: ["wal-community-safeguarding"],
    signalKeys: ["safeguarding"],
  }),
  walesRequirement({
    id: "wal.local-safeguarding-route",
    topic: "safeguarding",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Verify the site's current local authority and regional safeguarding-board referral and allegation procedures.",
    applicabilityExplanation:
      "Wales has six safeguarding-board areas; national guidance alone does not verify the site's contact points or thresholds.",
    unknownExplanation:
      "Record the actual local authority and board before marking the site's route reviewed.",
    expectedEvidence: [
      "Dated local referral directory, escalation/concern procedure and review owner",
    ],
    sourceIds: ["wal-safeguarding-guidance", "wal-community-safeguarding"],
    signalKeys: ["safeguarding"],
  }),
];
