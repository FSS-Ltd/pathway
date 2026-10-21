import type { TrackerProfileInput } from "@pathway/types";
import type { CatalogueRequirement, TrackerCatalogue } from "../schema";
import { belgiumRequirement, belgiumSource } from "./shared";

const review = {
  reviewer: "Codex primary-source and applicability review (automated)",
  verifiedAt: "2026-10-21",
  reviewDueAt: "2027-01-15",
  revision: "belgium-childcare-2026-10-21-r1",
};

type Source = TrackerCatalogue["sources"][number];
type SourceInput = Parameters<typeof belgiumSource>[0];

function source(input: SourceInput, territory: string[]): Source {
  const base = belgiumSource(input);
  return {
    ...base,
    territory,
    retrievedAt: review.verifiedAt,
    effective: { ...base.effective, currentAsOf: review.verifiedAt },
    review,
  };
}

export const belgiumChildcareSources: Source[] = [
  source(
    {
      id: "bel-opgroeien-starters",
      url: "https://www.opgroeien.be/aanbod/kinderopvang/starters",
      title: "Starting childcare and the Brussels licensing route",
      authority: "Opgroeien",
      provision:
        "Paid professional baby/toddler care needs an Opgroeien licence in the Flemish route; Brussels organised language determines the competent authority, with a distinct rule for natural-person family care.",
      classification: "GUIDANCE",
      language: "nl",
    },
    ["BE", "BE2", "BE1"],
  ),
  source(
    {
      id: "bel-one-authorisation",
      url: "https://my.one.be/information/faq/petite-enfance/",
      title: "ONE authorisation for early-childhood settings",
      authority: "Office de la Naissance et de l'Enfance",
      provision:
        "Collective and individual early-childhood settings need ONE authorisation before opening, whether or not they receive ONE subsidies.",
      classification: "GUIDANCE",
      language: "fr",
    },
    ["BE", "BE-FRENCH-COMMUNITY", "BE1", "BE3"],
  ),
  source(
    {
      id: "bel-iriscare-authorisation",
      url: "https://www.iriscare.brussels/fr/professionnels/familles-avec-enfants/accueil-denfants/",
      title: "Authorisation of Brussels bicommunal childcare",
      authority: "Iriscare",
      provision:
        "Bicommunal Brussels settings providing paid professional care for under-threes need authorisation at opening and throughout operation.",
      classification: "GUIDANCE",
      language: "fr",
    },
    ["BE", "BE1"],
  ),
  source(
    {
      id: "bel-german-care-recognition",
      url: "https://ostbelgienfamilie.be/desktopdefault.aspx/tabid-5887/",
      title: "Childcare recognition in the German-speaking Community",
      authority: "German-speaking Community family portal",
      provision:
        "A childcare offer in the German-speaking Community requires Ministry recognition before it starts; the portal distinguishes under-three and out-of-school provision.",
      classification: "GUIDANCE",
      language: "de",
    },
    ["BE", "BE-GERMAN-SPEAKING-COMMUNITY", "BE3"],
  ),
];

function action(
  input: Parameters<typeof belgiumRequirement>[0],
): CatalogueRequirement {
  return {
    ...belgiumRequirement(input),
    effective: { from: review.verifiedAt, to: null },
    review,
    materialChangeReason:
      "Initial reviewed authority-specific childcare action",
  };
}

const paidUnderThree = {
  field: "belgianPaidUnderThreeCare",
  op: "eq",
  value: true,
} as const;
const care = { field: "childcare", op: "eq", value: true } as const;
const authority = (
  value: NonNullable<TrackerProfileInput["belgianChildcareAuthority"]>,
) => ({ field: "belgianChildcareAuthority", op: "eq", value }) as const;
const region = (value: string) =>
  ({ field: "subdivisionCode", op: "eq", value }) as const;

export const belgiumChildcareRequirements: CatalogueRequirement[] = [
  action({
    id: "bel.opgroeien-under-three-licence",
    topic: "education_childcare",
    obligationClass: "STATUTORY_DUTY",
    condition: {
      all: [
        care,
        paidUnderThree,
        authority("OPGROEIEN"),
        { any: [region("BE1"), region("BE2")] },
      ],
    },
    action:
      "Hold the Opgroeien licence before providing paid professional baby/toddler childcare and keep its conditions under review.",
    applicabilityExplanation:
      "Applies to the declared Opgroeien route in Flanders or Brussels. Brussels language and service form must be confirmed with the authority; the education Community does not decide the care licence.",
    unknownExplanation:
      "Confirm whether the site provides paid professional under-three care, its Belgian Region and the competent childcare authority.",
    expectedEvidence: [
      "Site-specific Opgroeien licence and current authorised capacity",
      "Authority confirmation of the service form and conditions",
    ],
    sourceIds: ["bel-opgroeien-starters", "bel-flanders-care"],
    signalKeys: [],
  }),
  action({
    id: "bel.one-under-three-authorisation",
    topic: "education_childcare",
    obligationClass: "STATUTORY_DUTY",
    condition: {
      all: [
        care,
        paidUnderThree,
        authority("ONE"),
        { any: [region("BE1"), region("BE3")] },
      ],
    },
    action:
      "Obtain ONE authorisation before opening an in-scope early-childhood setting and retain the authorised care project.",
    applicabilityExplanation:
      "ONE says collective and individual early-childhood settings require authorisation whether subsidised or not. Confirm the Brussels language route or Walloon local scope with ONE.",
    unknownExplanation:
      "Confirm paid under-three care, the site Region and whether ONE is the competent authority.",
    expectedEvidence: [
      "Site-specific ONE authorisation and approved care project",
      "Authority confirmation of capacity and conditions",
    ],
    sourceIds: ["bel-one-authorisation", "bel-opgroeien-starters"],
    signalKeys: [],
  }),
  action({
    id: "bel.iriscare-under-three-authorisation",
    topic: "education_childcare",
    obligationClass: "STATUTORY_DUTY",
    condition: {
      all: [care, paidUnderThree, authority("IRISCARE"), region("BE1")],
    },
    action:
      "Hold Iriscare authorisation before operating a Brussels bicommunal paid under-three childcare setting and throughout operation.",
    applicabilityExplanation:
      "The Iriscare route is for Brussels bicommunal settings. A Brussels address alone does not make Iriscare the regulator.",
    unknownExplanation:
      "Confirm the childcare service's organised language, paid under-three provision and Brussels authority.",
    expectedEvidence: [
      "Current Iriscare authorisation for this childcare site",
      "Documented inspection and operating conditions",
    ],
    sourceIds: ["bel-iriscare-authorisation", "bel-opgroeien-starters"],
    signalKeys: [],
  }),
  action({
    id: "bel.german-care-recognition",
    topic: "education_childcare",
    obligationClass: "STATUTORY_DUTY",
    condition: {
      all: [care, authority("GERMAN_COMMUNITY_MINISTRY"), region("BE3")],
    },
    action:
      "Obtain Ministry recognition before starting an in-scope childcare offer in the German-speaking Community.",
    applicabilityExplanation:
      "The German-speaking Community describes Ministry recognition before childcare starts, covering forms including crèches and out-of-school care. Confirm the precise service category with the Ministry.",
    unknownExplanation:
      "Confirm the childcare service form, physical Region and competent German-speaking Community authority.",
    expectedEvidence: [
      "Ministry recognition for the site's childcare service and authorised service category",
    ],
    sourceIds: ["bel-german-care-recognition"],
    signalKeys: [],
  }),
];

export { review as belgiumChildcareReview };
