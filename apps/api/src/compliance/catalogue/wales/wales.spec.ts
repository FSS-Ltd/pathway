import { TRACKER_CATALOGUE, catalogueSchema } from "..";
import { catalogueV12 } from "../v1.2";
import { TRACKER_TOPICS, type TrackerProfileInput } from "@pathway/types";
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
    location: { countryCode: "GB", subdivisionCode: "GB-WLS" },
    attestations: [],
    evidenceCounts: {},
    now,
  });
}

describe("Wales progressive national release", () => {
  it("combines independent-school and ICCE routes without inferring funded status", () => {
    const both = checklist({ ace: true, icce: true });
    expect(
      both.items.find(
        (item) => item.requirement.id === "wal.independent-registration",
      )?.applicability,
    ).toBe("APPLICABLE");
    expect(
      both.items.find(
        (item) => item.requirement.id === "wal-icce-registration-action",
      )?.applicability,
    ).toBe("APPLICABLE");
    expect(both.progress.completed).toBe(0);

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
        (item) => item.requirement.id === "wal.maintained-curriculum-route",
      )?.applicability,
    ).toBe("NOT_APPLICABLE");
    expect(
      centre.items.find(
        (item) => item.requirement.id === "wal-icce-registration-action",
      )?.applicability,
    ).toBe("NOT_APPLICABLE");
    expect(centre.coverageGaps).toBe(8);
  });
  it("adds Wales coverage across all six institutional sectors without rewriting England history", () => {
    expect(catalogueSchema.safeParse(TRACKER_CATALOGUE).success).toBe(true);
    const cells = TRACKER_CATALOGUE.coverage.filter(
      (cell) => cell.jurisdiction === "GB-WLS",
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
          (r) => r.jurisdiction === "GB-WLS" && r.topic === topic,
        ),
      ).toBe(true);
    }
    expect(
      TRACKER_CATALOGUE.sources.filter((s) => s.territory.includes("GB-ENG")),
    ).toEqual(catalogueV12.sources);
    expect(
      TRACKER_CATALOGUE.requirements.filter((r) => r.jurisdiction === "GB-ENG"),
    ).toEqual(catalogueV12.requirements);
    expect(TRACKER_CATALOGUE.coverage).toHaveLength(1488);
    expect(
      TRACKER_CATALOGUE.coverage.filter(
        (cell) => cell.status === "NOT_REVIEWED",
      ),
    ).toHaveLength(912);
  });
});
