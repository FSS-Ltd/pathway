import type { CatalogueRequirement, TrackerCatalogue } from "../schema";
import { walesRequirement, walesSource } from "./shared";

const providerPages = [
  [
    "wal-icce-registration",
    "https://www.icce.education/school-hea-registration",
    "School/HEA registration",
    "Registration, quality visits, entity status and renewal",
  ],
  [
    "wal-icce-training",
    "https://www.icce.education/training",
    "ICCE training",
    "Role training, annual CPD and regional renewal conditions",
  ],
  [
    "wal-icce-enrolment",
    "https://www.icce.education/enrolling-students",
    "ICCE enrolling students",
    "Certificate enrolment, coordinator and academic projection approval",
  ],
  [
    "wal-icce-moderation",
    "https://www.icce.education/moderation-1",
    "ICCE moderation",
    "Approved moderator, internal samples and external submissions",
  ],
  [
    "wal-ace-context",
    "https://www.christian.education/schools",
    "Christian Education Europe schools",
    "Public institutional context; actual agreement terms require independent review",
  ],
] as const;
export const icceSources: TrackerCatalogue["sources"] = providerPages.map(
  ([id, url, title, provision]) =>
    walesSource({
      id,
      url,
      title,
      provision,
      authority:
        id === "wal-ace-context"
          ? "Christian Education Europe"
          : "International Certificate of Christian Education",
      classification: "PROVIDER",
      publishedAt: null,
      publishedDateUnknownReason: "Provider page publication day not verified.",
      effective: {
        from: null,
        to: null,
        currentAsOf: "2026-10-17",
        unknownReason:
          "Current public provider text observed; entity-specific terms and effective dates require external confirmation.",
      },
    }),
);
const participation: CatalogueRequirement["condition"] = {
  field: "icce",
  op: "eq",
  value: true,
};
export const icceRequirements: CatalogueRequirement[] = [
  walesRequirement({
    id: "wal-icce-registration-action",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: participation,
    action:
      "Confirm active ICCE entity registration, approval and renewal terms.",
    applicabilityExplanation:
      "ICCE participation, not ACE branding or Welsh school status, triggers this provider requirement. Portal records do not prove ICCE approval.",
    unknownExplanation:
      "Confirm participation and the current external registration decision.",
    expectedEvidence: [
      "External registration decision, entity ID, review and renewal dates",
    ],
    sourceIds: ["wal-icce-registration"],
    signalKeys: ["ace"],
  }),
  walesRequirement({
    id: "wal-icce-training-action",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: participation,
    action:
      "Verify ICCE role-specific training, prescribed CPD and regional renewal terms.",
    applicabilityExplanation:
      "Coordinator, moderator and marking roles have different provider training requirements; assess actual roles and regional terms.",
    unknownExplanation:
      "Confirm ICCE roles, approved courses and regional conditions.",
    expectedEvidence: [
      "Role register, completed provider training, CPD and renewal records",
    ],
    sourceIds: ["wal-icce-training"],
    signalKeys: ["ace", "personnel"],
  }),
  walesRequirement({
    id: "wal-icce-enrolment-action",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: participation,
    action:
      "Record each ICCE certificate enrolment and obtain external academic-projection approval before certificate work.",
    applicabilityExplanation:
      "A portal projection is evidence of preparation, not the provider's decision.",
    unknownExplanation:
      "Confirm participation, certificate route and external decisions.",
    expectedEvidence: [
      "Certificate enrolment receipt, student ID mapping and approved projection date",
    ],
    sourceIds: ["wal-icce-enrolment"],
    signalKeys: ["ace"],
  }),
  walesRequirement({
    id: "wal-icce-moderation-action",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: participation,
    action:
      "Use the approved ICCE moderator and complete required internal and external moderation.",
    applicabilityExplanation:
      "Apply the current provider sampling and anonymised submission procedures to the entity's courses.",
    unknownExplanation:
      "Confirm participation, moderator approval and current provider procedure.",
    expectedEvidence: [
      "Moderator approval, sampling record, anonymised submissions and external decisions",
    ],
    sourceIds: ["wal-icce-moderation"],
    signalKeys: ["ace"],
  }),
  walesRequirement({
    id: "wal-ace-agreement-review",
    topic: "ace_icce",
    obligationClass: "RECOMMENDATION",
    condition: { field: "ace", op: "eq", value: true },
    action:
      "Obtain and review the institution's current ACE agreement for applicable terms.",
    applicabilityExplanation:
      "Public information does not establish current ACE-only institutional obligations. ICCE participation is assessed separately.",
    unknownExplanation:
      "Confirm ACE participation and obtain the actual regional agreement.",
    expectedEvidence: [
      "Current agreement, applicable term review and clarification correspondence",
    ],
    sourceIds: ["wal-ace-context"],
    signalKeys: ["ace", "agreements"],
  }),
];
