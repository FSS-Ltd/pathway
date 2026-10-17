import type { CatalogueRequirement } from "../schema";
import { walesRequirement } from "./shared";
const independent = {
  field: "providerCategory",
  op: "eq",
  value: "INDEPENDENT_SCHOOL",
} as const;
export const registrationRequirements: CatalogueRequirement[] = [
  walesRequirement({
    id: "wal.provider-classification",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Classify the site's actual school, childcare and out-of-school provision before applying Welsh registration routes.",
    applicabilityExplanation:
      "ACE identity, sector and selected screens do not determine legal school status. Age, attendance, full-time provision and special circumstances need assessment.",
    unknownExplanation:
      "Record missing operating facts and seek the appropriate authority's classification.",
    expectedEvidence: [
      "Provision and age assessment; Welsh Government/CIW classification correspondence where needed",
    ],
    sourceIds: ["wal-school-registration", "wal-childcare-exceptions"],
    signalKeys: [],
  }),
  walesRequirement({
    id: "wal.independent-registration",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: independent,
    action:
      "Hold Welsh independent-school registration before admitting pupils and obtain consent before a material registration change.",
    applicabilityExplanation:
      "This applies to an actual independent school in Wales, including one operated by an ACE, church, charity, club or learning centre entity.",
    unknownExplanation:
      "The provider's legal classification or registration decision is unresolved; do not infer it from a school screen.",
    expectedEvidence: [
      "Welsh Ministers' registration decision and approved particulars",
      "Material-change decisions and inspection correspondence",
    ],
    sourceIds: ["wal-school-registration", "wal-iss"],
    signalKeys: [],
  }),
  walesRequirement({
    id: "wal.independent-returns",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: independent,
    action:
      "Maintain required initial and annual independent-school information returns to Welsh Ministers.",
    applicabilityExplanation:
      "The 2024 provision-of-information regulations specify returns for registered independent schools; use actual request and current schedule.",
    unknownExplanation:
      "Confirm independent-school registration and the regulator's return timetable.",
    expectedEvidence: [
      "Submitted returns, dates and regulator acknowledgements",
    ],
    sourceIds: ["wal-school-returns", "wal-school-registration"],
    signalKeys: [],
  }),
  walesRequirement({
    id: "wal.school-complaints",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: independent,
    action:
      "Maintain and make available the independent school's complaints procedure required by the Welsh standards.",
    applicabilityExplanation:
      "Paragraph 29 of the 2024 independent-school standards applies to registered independent-school proprietors.",
    unknownExplanation:
      "Determine whether the site's actual provision is an independent school.",
    expectedEvidence: [
      "Versioned complaints procedure, website availability where present, and request/provision records where no website",
    ],
    sourceIds: ["wal-iss"],
    signalKeys: ["agreements"],
  }),
];
