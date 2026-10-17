import type { CatalogueRequirement } from "../schema";
import { walesRequirement } from "./shared";
const independent = {
  field: "providerCategory",
  op: "eq",
  value: "INDEPENDENT_SCHOOL",
} as const;
const children = { field: "minimumAge", op: "lte", value: 17 } as const;
export const personnelRequirements: CatalogueRequirement[] = [
  walesRequirement({
    id: "wal.dbs-role-assessment",
    topic: "personnel",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Assess each child-facing role for Welsh DBS eligibility, barred-list rules, recruitment safeguards and review dates.",
    applicabilityExplanation:
      "DBS requirements depend on actual duties, age and regulated-activity status. A parent or adult portal account alone is not a check trigger; a DBS certificate has no generic expiry.",
    unknownExplanation:
      "Confirm duties, supervision/current regulated-activity definitions and organisation-specific review requirements.",
    expectedEvidence: [
      "Role-based eligibility assessment and checks register without storing unnecessary certificate detail",
    ],
    sourceIds: ["wal-dbs-current", "wal-safeguarding-guidance"],
    signalKeys: ["personnel"],
  }),
  walesRequirement({
    id: "wal.independent-check-renewal",
    topic: "personnel",
    obligationClass: "STATUTORY_DUTY",
    condition: independent,
    action:
      "Apply the Welsh independent-school pre-appointment and at-least-every-three-years DBS or Update Service check requirements to relevant roles.",
    applicabilityExplanation:
      "Schedule paragraphs 23–24 of the 2024 Welsh independent-school standards set role-specific checks and records. This Welsh requirement is distinct from a generic DBS certificate expiry, which does not exist.",
    unknownExplanation:
      "Confirm independent-school status, each covered role and lawful route for checks or Update Service status.",
    expectedEvidence: [
      "Role-scoped single central record, check/application and three-year review dates, exception reasons",
    ],
    sourceIds: ["wal-iss", "wal-school-registration"],
    signalKeys: ["personnel"],
  }),
  walesRequirement({
    id: "wal.independent-ewc",
    topic: "personnel",
    obligationClass: "STATUTORY_DUTY",
    condition: independent,
    action:
      "Verify Education Workforce Council registration for relevant independent-school teachers and learning support workers.",
    applicabilityExplanation:
      "The Welsh independent-school workforce categories apply to covered teaching and support work, not every volunteer or portal account.",
    unknownExplanation:
      "Identify actual education roles and applicable EWC registration category before assessing individuals.",
    expectedEvidence: [
      "Role and registration checks, register review and employer notifications where applicable",
    ],
    sourceIds: ["wal-ewc"],
    signalKeys: ["personnel"],
  }),
];
