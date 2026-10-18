import type { CatalogueRequirement } from "../schema";
import { northernIrelandRequirement as action } from "./shared";

const independent = {
  field: "providerCategory",
  op: "eq",
  value: "INDEPENDENT_SCHOOL",
} as const;
const children = { field: "minimumAge", op: "lte", value: 17 } as const;
const care: CatalogueRequirement["condition"] = {
  any: [
    { field: "providerCategory", op: "eq", value: "CHILDCARE" },
    { field: "providerCategory", op: "eq", value: "EARLY_YEARS" },
    { field: "childcare", op: "eq", value: true },
  ],
};

export const coreRequirements: CatalogueRequirement[] = [
  action({
    id: "nir.provider-classification",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Classify actual school, childcare and out-of-school provision before choosing a Northern Ireland registration route.",
    applicabilityExplanation:
      "Product sector and ACE participation do not establish legal status; age, hours, reward and educational provision matter.",
    unknownExplanation:
      "Record the actual provision and seek Department of Education or HSC Trust advice where classification is uncertain.",
    expectedEvidence: [
      "Provision assessment, ages and hours, regulator correspondence",
    ],
    sourceIds: ["nir-school-registration", "nir-childcare-registration"],
    signalKeys: [],
  }),
  action({
    id: "nir.independent-registration",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: independent,
    action:
      "Submit the Northern Ireland independent-school registration application and maintain required annual and change notifications.",
    applicabilityExplanation:
      "The Department of Education requires registration of actual independent schools; its guidance says submit the application within one month of opening, with provisional and full registration stages.",
    unknownExplanation:
      "Confirm whether the actual provision meets the independent-school definition and the school's current registration stage.",
    expectedEvidence: [
      "Application, provisional/full registration correspondence, annual information and change notifications",
    ],
    sourceIds: ["nir-school-registration"],
    signalKeys: [],
  }),
  action({
    id: "nir.childcare-registration",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: care,
    action:
      "Confirm and hold relevant HSC Trust registration for in-scope childminding or daycare.",
    applicabilityExplanation:
      "The Children (NI) Order 1995 route covers qualifying care for children under 12; a learning centre is not automatically a daycare provider.",
    unknownExplanation:
      "Check ages, care hours, reward, exemptions and the responsible HSC Trust Early Years Team.",
    expectedEvidence: [
      "HSC Trust classification, registration certificate and conditions or documented exception",
    ],
    sourceIds: ["nir-childcare-registration", "nir-childcare-standards"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Only after documenting why the actual provision is outside registrable childcare, with HSC Trust confirmation where uncertain.",
  }),
  action({
    id: "nir.child-protection-framework",
    topic: "safeguarding",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Maintain child-protection reporting, escalation and recordkeeping routes for child-facing provision.",
    applicabilityExplanation:
      "Northern Ireland's cross-sector safeguarding framework covers private, voluntary, community and faith providers; local HSC Trust and SBNI routes must be checked.",
    unknownExplanation:
      "Confirm whether children are served and identify local referral contacts and responsible leads.",
    expectedEvidence: [
      "Versioned procedure, named leads, referral contacts and training records",
    ],
    sourceIds: ["nir-safeguarding-framework"],
    signalKeys: ["safeguarding"],
  }),
  action({
    id: "nir.school-safeguarding",
    topic: "safeguarding",
    obligationClass: "RECOMMENDATION",
    condition: independent,
    action:
      "Review the independent school's safeguarding policies and designated responsibilities against current Department of Education guidance.",
    applicabilityExplanation:
      "Revised Circular 2017/04 explicitly includes independent schools, and the school must apply its current advice and guidance according to its status.",
    unknownExplanation:
      "Confirm school status, management responsibilities and current circular version.",
    expectedEvidence: [
      "School policy, designated responsibilities, board/proprietor review, referrals and training",
    ],
    sourceIds: ["nir-school-safeguarding"],
    signalKeys: ["safeguarding", "personnel"],
  }),
  action({
    id: "nir.accessni-role-assessment",
    topic: "personnel",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Assess each child-facing role for regulated activity and obtain only the AccessNI check and barred-list information lawfully appropriate to that role.",
    applicabilityExplanation:
      "The supervision exemption for frequent child teaching, supervision, instruction and care was removed in September 2026; a parent/adult account alone does not make a role eligible.",
    unknownExplanation:
      "Document each worker's actual duties, frequency, supervision and school/childcare setting before selecting a check level.",
    expectedEvidence: [
      "Role eligibility decision, AccessNI verification, recruitment date and organisation review",
    ],
    sourceIds: ["nir-accessni", "nir-recruitment"],
    signalKeys: ["personnel"],
  }),
];
