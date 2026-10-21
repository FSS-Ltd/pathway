import { TRACKER_TOPICS } from "@pathway/types";
import type { TrackerProfileInput } from "@pathway/types";
import { TRACKER_CATALOGUE, catalogueSchema } from "..";
import { catalogueV17 } from "../v1.7";
import { trackerProfileInput } from "../../tracker.dto";
import { buildTrackerChecklist } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";

function checklist(
  changes: Partial<TrackerProfileInput>,
  subdivisionCode = "",
) {
  const now = new Date(`${TRACKER_CATALOGUE.releasedAt}T12:00:00Z`);
  return buildTrackerChecklist({
    catalogue: TRACKER_CATALOGUE,
    profile: {
      version: 1,
      updatedAt: now.toISOString(),
      profile: trackerProfileInput.parse({ ...testProfile, ...changes }),
    },
    location: { countryCode: "BE", subdivisionCode },
    attestations: [],
    evidenceCounts: {},
    now,
  });
}

describe("Belgium shared-core release", () => {
  it("separates school, care and ICCE from the selected vertical", () => {
    const school = checklist({
      sector: "SCHOOL",
      providerCategory: "INDEPENDENT_SCHOOL",
      ace: true,
      icce: true,
    });
    expect(
      school.items.find(
        (item) => item.requirement.id === "bel.school-community-route",
      )?.applicability,
    ).toBe("APPLICABLE");
    expect(
      school.items.find(
        (item) => item.requirement.id === "bel.icce-registration",
      )?.applicability,
    ).toBe("APPLICABLE");
    const centre = checklist({
      sector: "LEARNING_CENTRE",
      vertical: "PUBLIC_LEARNING_CENTRE",
      providerCategory: "OUT_OF_SCHOOL",
      fundingStatus: "PRIVATE",
      childcare: false,
      icce: false,
    });
    expect(
      centre.items.find(
        (item) => item.requirement.id === "bel.school-community-route",
      )?.applicability,
    ).toBe("NOT_APPLICABLE");
    expect(
      centre.items.find(
        (item) => item.requirement.id === "bel.childcare-community-route",
      )?.applicability,
    ).toBe("NOT_APPLICABLE");
    expect(
      centre.items.find(
        (item) => item.requirement.id === "bel.icce-registration",
      )?.applicability,
    ).toBe("NOT_APPLICABLE");
    expect(centre.coverageGaps).toBe(8);
    expect(centre.progress.completed).toBe(0);
  });

  it("publishes reviewed partial cells and preserves all earlier releases", () => {
    expect(TRACKER_CATALOGUE.version).toBe("1.40.0");
    expect(catalogueSchema.safeParse(TRACKER_CATALOGUE).success).toBe(true);
    const cells = TRACKER_CATALOGUE.coverage.filter(
      (cell) => cell.jurisdiction === "BE",
    );
    expect(cells).toHaveLength(48);
    expect(
      cells.every(
        (cell) =>
          cell.status === "PARTIALLY_PUBLISHED" &&
          cell.regionalStatus === "IN_REVIEW" &&
          cell.requiresRegion,
      ),
    ).toBe(true);
    expect(new Set(cells.map((cell) => cell.sector)).size).toBe(6);
    expect(
      TRACKER_CATALOGUE.sources.find(
        (source) => source.id === "bel-flanders-care",
      )?.territory,
    ).toEqual(["BE", "BE-FLEMISH-COMMUNITY"]);
    expect(
      TRACKER_CATALOGUE.sources.find(
        (source) => source.id === "bel-french-care",
      )?.territory,
    ).toEqual(["BE", "BE-FRENCH-COMMUNITY"]);
    for (const topic of TRACKER_TOPICS) {
      expect(
        TRACKER_CATALOGUE.requirements.some(
          (requirement) =>
            requirement.jurisdiction === "BE" && requirement.topic === topic,
        ),
      ).toBe(true);
    }
    expect(
      TRACKER_CATALOGUE.requirements.slice(0, catalogueV17.requirements.length),
    ).toEqual(catalogueV17.requirements);
    expect(
      TRACKER_CATALOGUE.sources.slice(0, catalogueV17.sources.length),
    ).toEqual(catalogueV17.sources);
  });

  it.each([
    ["OPGROEIEN", "BE2", "bel.opgroeien-under-three-licence"],
    ["ONE", "BE3", "bel.one-under-three-authorisation"],
    ["IRISCARE", "BE1", "bel.iriscare-under-three-authorisation"],
  ] as const)(
    "applies the %s under-three route only to declared paid care in %s",
    (authority, region, requirementId) => {
      const care = {
        childcare: true,
        belgianPaidUnderThreeCare: true,
        belgianChildcareAuthority: authority,
      } as const;
      const item = (
        changes: Partial<TrackerProfileInput>,
        area: string = region,
      ) =>
        checklist({ ...care, ...changes }, area).items.find(
          (entry) => entry.requirement.id === requirementId,
        )?.applicability;
      expect(item({})).toBe("APPLICABLE");
      expect(item({ belgianPaidUnderThreeCare: false })).toBe("NOT_APPLICABLE");
      expect(item({ belgianChildcareAuthority: null })).toBe("UNRESOLVED");
      expect(item({}, "")).toBe("UNRESOLVED");
      expect(item({ childcare: false })).toBe("NOT_APPLICABLE");
    },
  );

  it("applies German-speaking childcare recognition to school-age care too", () => {
    const item = checklist(
      {
        childcare: true,
        belgianPaidUnderThreeCare: false,
        belgianChildcareAuthority: "GERMAN_COMMUNITY_MINISTRY",
      },
      "BE3",
    ).items.find(
      (entry) => entry.requirement.id === "bel.german-care-recognition",
    );
    expect(item?.applicability).toBe("APPLICABLE");
    expect(item?.completed).toBe(false);
    expect(
      checklist(
        {
          childcare: true,
          belgianChildcareAuthority: "GERMAN_COMMUNITY_MINISTRY",
        },
        "BE1",
      ).items.find(
        (entry) => entry.requirement.id === "bel.german-care-recognition",
      )?.applicability,
    ).toBe("NOT_APPLICABLE");
  });

  it("applies Flemish recognition only to a declared Community-recognised school", () => {
    const profile = {
      providerCategory: "INDEPENDENT_SCHOOL",
      belgianEducationCommunity: "FLEMISH",
      belgianSchoolRecognitionStatus: "COMMUNITY_RECOGNISED",
      fundingStatus: "PRIVATE",
    } as const;
    const applicability = (
      changes: Partial<TrackerProfileInput>,
      region = "BE2",
    ) =>
      checklist({ ...profile, ...changes }, region).items.find(
        (item) => item.requirement.id === "bel.flemish-school-recognition",
      )?.applicability;
    expect(applicability({})).toBe("APPLICABLE");
    expect(applicability({ fundingStatus: "PUBLIC" })).toBe("APPLICABLE");
    expect(applicability({}, "BE1")).toBe("APPLICABLE");
    expect(applicability({ belgianSchoolRecognitionStatus: null })).toBe(
      "UNRESOLVED",
    );
    expect(
      applicability({ belgianSchoolRecognitionStatus: "NOT_RECOGNISED" }),
    ).toBe("NOT_APPLICABLE");
    expect(
      applicability({ belgianSchoolRecognitionStatus: "RECOGNISED_ELSEWHERE" }),
    ).toBe("NOT_APPLICABLE");
    expect(applicability({ belgianEducationCommunity: "FRENCH" })).toBe(
      "NOT_APPLICABLE",
    );
    expect(applicability({ providerCategory: "OUT_OF_SCHOOL" })).toBe(
      "NOT_APPLICABLE",
    );
    expect(applicability({}, "")).toBe("UNRESOLVED");
    expect(applicability({}, "BE3")).toBe("NOT_APPLICABLE");
  });
});
