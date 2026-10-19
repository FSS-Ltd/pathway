import { TRACKER_TOPICS, type TrackerProfileInput } from "@pathway/types";
import { TRACKER_CATALOGUE, catalogueSchema } from "..";
import { catalogueV16 } from "../v1.6";
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
    location: { countryCode: "AT", subdivisionCode: "" },
    attestations: [],
    evidenceCounts: {},
    now,
  });
}

describe("Austria progressive national release", () => {
  it("separates actual private-school status and ICCE from a public learning centre", () => {
    const school = checklist({
      sector: "SCHOOL",
      providerCategory: "INDEPENDENT_SCHOOL",
      ace: true,
      icce: true,
    });
    expect(
      school.items.find(
        (item) => item.requirement.id === "aut.private-school-opening",
      )?.applicability,
    ).toBe("APPLICABLE");
    expect(
      school.items.find(
        (item) => item.requirement.id === "aut.icce-registration",
      )?.applicability,
    ).toBe("APPLICABLE");
    expect(school.progress.completed).toBe(0);

    const centre = checklist({
      sector: "LEARNING_CENTRE",
      vertical: "PUBLIC_LEARNING_CENTRE",
      providerCategory: "OUT_OF_SCHOOL",
      fundingStatus: "PRIVATE",
      ace: false,
      icce: false,
    });
    expect(
      centre.items.find(
        (item) => item.requirement.id === "aut.private-school-opening",
      )?.applicability,
    ).toBe("NOT_APPLICABLE");
    expect(
      centre.items.find(
        (item) => item.requirement.id === "aut.icce-registration",
      )?.applicability,
    ).toBe("NOT_APPLICABLE");
    expect(centre.coverageGaps).toBe(8);
  });

  it("publishes partial national cells while retaining regional and prior-release gaps", () => {
    expect(catalogueSchema.safeParse(TRACKER_CATALOGUE).success).toBe(true);
    const cells = TRACKER_CATALOGUE.coverage.filter(
      (cell) => cell.jurisdiction === "AT",
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
            requirement.jurisdiction === "AT" && requirement.topic === topic,
        ),
      ).toBe(true);
    }
    expect(
      TRACKER_CATALOGUE.requirements.slice(0, catalogueV16.requirements.length),
    ).toEqual(catalogueV16.requirements);
    expect(
      TRACKER_CATALOGUE.sources.slice(0, catalogueV16.sources.length),
    ).toEqual(catalogueV16.sources);
    const opening = TRACKER_CATALOGUE.sources.find(
      (source) => source.id === "aut-private-opening",
    );
    expect(opening?.url).toContain("FassungVom=2026-10-18");
    expect(opening?.effective.to).toBe("2026-12-31");
    expect(opening?.review.reviewDueAt).toBe("2026-12-30");
  });
});
