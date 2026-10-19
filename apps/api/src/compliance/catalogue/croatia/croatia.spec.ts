import { TRACKER_TOPICS, type TrackerProfileInput } from "@pathway/types";
import { TRACKER_CATALOGUE, catalogueSchema } from "..";
import { catalogueV19 } from "../v1.9";
import { trackerProfileInput } from "../../tracker.dto";
import { buildTrackerChecklist } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";

function checklist(changes: Partial<TrackerProfileInput>) {
  const now = new Date("2026-10-19T12:00:00Z");
  return buildTrackerChecklist({
    catalogue: TRACKER_CATALOGUE,
    profile: {
      version: 1,
      updatedAt: now.toISOString(),
      profile: trackerProfileInput.parse({ ...testProfile, ...changes }),
    },
    location: { countryCode: "HR", subdivisionCode: "" },
    attestations: [],
    evidenceCounts: {},
    now,
  });
}

describe("Croatia progressive national release", () => {
  it("separates an actual private school and ICCE from a non-ACE learning centre", () => {
    const school = checklist({
      sector: "SCHOOL",
      providerCategory: "INDEPENDENT_SCHOOL",
      ace: true,
      icce: true,
    });
    expect(
      school.items.find(
        (item) => item.requirement.id === "hrv.private-school-start",
      )?.applicability,
    ).toBe("APPLICABLE");
    expect(
      school.items.find(
        (item) => item.requirement.id === "hrv.icce-registration",
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
        (item) => item.requirement.id === "hrv.private-school-start",
      )?.applicability,
    ).toBe("NOT_APPLICABLE");
    expect(
      centre.items.find(
        (item) => item.requirement.id === "hrv.kindergarten-route",
      )?.applicability,
    ).toBe("NOT_APPLICABLE");
    expect(
      centre.items.find(
        (item) => item.requirement.id === "hrv.shorter-preschool",
      )?.applicability,
    ).toBe("APPLICABLE");
    expect(
      centre.items.find(
        (item) => item.requirement.id === "hrv.icce-registration",
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
      nursery.items.find(
        (item) => item.requirement.id === "hrv.kindergarten-route",
      )?.applicability,
    ).toBe("APPLICABLE");
  });

  it("does not raise the shorter preschool review for older-only tutoring", () => {
    const olderCentre = checklist({
      sector: "LEARNING_CENTRE",
      vertical: "PUBLIC_LEARNING_CENTRE",
      providerCategory: "OUT_OF_SCHOOL",
      minimumAge: 10,
    });
    expect(
      olderCentre.items.find(
        (item) => item.requirement.id === "hrv.shorter-preschool",
      )?.applicability,
    ).toBe("NOT_APPLICABLE");
  });

  it("publishes partial cells and preserves earlier catalogue releases", () => {
    expect(catalogueSchema.safeParse(TRACKER_CATALOGUE).success).toBe(true);
    const cells = TRACKER_CATALOGUE.coverage.filter(
      (cell) => cell.jurisdiction === "HR",
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
            requirement.jurisdiction === "HR" && requirement.topic === topic,
        ),
      ).toBe(true);
    }
    expect(
      TRACKER_CATALOGUE.requirements.slice(0, catalogueV19.requirements.length),
    ).toEqual(catalogueV19.requirements);
    expect(
      TRACKER_CATALOGUE.sources.slice(0, catalogueV19.sources.length),
    ).toEqual(catalogueV19.sources);
  });
});
