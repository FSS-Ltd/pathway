import { TRACKER_TOPICS, type TrackerProfileInput } from "@pathway/types";
import { TRACKER_CATALOGUE, catalogueSchema } from "..";
import { catalogueV110 } from "../v1.10";
import { trackerProfileInput } from "../../tracker.dto";
import { buildTrackerChecklist } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";

function checklist(changes: Partial<TrackerProfileInput>) {
  const now = new Date(`${TRACKER_CATALOGUE.releasedAt}T12:00:00Z`);
  return buildTrackerChecklist({
    catalogue: TRACKER_CATALOGUE,
    profile: {
      version: 1,
      updatedAt: now.toISOString(),
      profile: trackerProfileInput.parse({ ...testProfile, ...changes }),
    },
    location: { countryCode: "CY", subdivisionCode: "" },
    attestations: [],
    evidenceCounts: {},
    now,
  });
}

describe("Cyprus progressive national release", () => {
  it("separates an actual private school and ICCE from a non-ACE learning centre", () => {
    const school = checklist({
      sector: "SCHOOL",
      providerCategory: "INDEPENDENT_SCHOOL",
      ace: true,
      icce: true,
    });
    expect(
      school.items.find(
        (item) => item.requirement.id === "cyp.private-school-approval",
      )?.applicability,
    ).toBe("APPLICABLE");
    expect(
      school.items.find(
        (item) => item.requirement.id === "cyp.icce-registration",
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
        (item) => item.requirement.id === "cyp.private-school-approval",
      )?.applicability,
    ).toBe("NOT_APPLICABLE");
    expect(
      centre.items.find((item) => item.requirement.id === "cyp.day-care-route")
        ?.applicability,
    ).toBe("NOT_APPLICABLE");
    expect(
      centre.items.find(
        (item) => item.requirement.id === "cyp.private-institute-route",
      )?.applicability,
    ).toBe("APPLICABLE");
    expect(
      centre.items.find(
        (item) => item.requirement.id === "cyp.icce-registration",
      )?.applicability,
    ).toBe("NOT_APPLICABLE");
    expect(centre.coverageGaps).toBe(8);
    expect(centre.progress.completed).toBe(0);
  });

  it("keeps the relevant care route for a nursery even if the childcare flag is false", () => {
    const nursery = checklist({
      sector: "LEARNING_CENTRE",
      vertical: "PUBLIC_LEARNING_CENTRE",
      providerCategory: "EARLY_YEARS",
      childcare: false,
    });
    expect(
      nursery.items.find((item) => item.requirement.id === "cyp.day-care-route")
        ?.applicability,
    ).toBe("APPLICABLE");
  });

  it("keeps the institute review for older tutoring without assuming care", () => {
    const olderCentre = checklist({
      sector: "LEARNING_CENTRE",
      vertical: "PUBLIC_LEARNING_CENTRE",
      providerCategory: "OUT_OF_SCHOOL",
      minimumAge: 10,
      childcare: false,
    });
    expect(
      olderCentre.items.find(
        (item) => item.requirement.id === "cyp.private-institute-route",
      )?.applicability,
    ).toBe("APPLICABLE");
    expect(
      olderCentre.items.find(
        (item) => item.requirement.id === "cyp.day-care-route",
      )?.applicability,
    ).toBe("NOT_APPLICABLE");
  });

  it("publishes partial cells and preserves earlier catalogue releases", () => {
    expect(catalogueSchema.safeParse(TRACKER_CATALOGUE).success).toBe(true);
    const cells = TRACKER_CATALOGUE.coverage.filter(
      (cell) => cell.jurisdiction === "CY",
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
    for (const topic of TRACKER_TOPICS) {
      expect(
        TRACKER_CATALOGUE.requirements.some(
          (requirement) =>
            requirement.jurisdiction === "CY" && requirement.topic === topic,
        ),
      ).toBe(true);
    }
    expect(
      TRACKER_CATALOGUE.requirements.slice(
        0,
        catalogueV110.requirements.length,
      ),
    ).toEqual(catalogueV110.requirements);
    expect(
      TRACKER_CATALOGUE.sources.slice(0, catalogueV110.sources.length),
    ).toEqual(catalogueV110.sources);
  });
});
