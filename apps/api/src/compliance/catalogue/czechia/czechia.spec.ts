import { TRACKER_TOPICS, type TrackerProfileInput } from "@pathway/types";
import { TRACKER_CATALOGUE, catalogueSchema } from "..";
import { catalogueV111 } from "../v1.11";
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
    location: { countryCode: "CZ", subdivisionCode: "" },
    attestations: [],
    evidenceCounts: {},
    now,
  });
}

describe("Czechia progressive national release", () => {
  it("keeps school registration separate from ACE, ICCE and a public learning-centre label", () => {
    const school = checklist({
      sector: "SCHOOL",
      providerCategory: "INDEPENDENT_SCHOOL",
      ace: true,
      icce: true,
    });
    expect(
      school.items.find((item) => item.requirement.id === "cze.school-register")
        ?.applicability,
    ).toBe("APPLICABLE");
    expect(
      school.items.find(
        (item) => item.requirement.id === "cze.icce-registration",
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
      centre.items.find((item) => item.requirement.id === "cze.school-register")
        ?.applicability,
    ).toBe("NOT_APPLICABLE");
    expect(
      centre.items.find(
        (item) => item.requirement.id === "cze.children-group-route",
      )?.applicability,
    ).toBe("NOT_APPLICABLE");
    expect(
      centre.items.find(
        (item) => item.requirement.id === "cze.icce-registration",
      )?.applicability,
    ).toBe("NOT_APPLICABLE");
    expect(centre.coverageGaps).toBe(8);
    expect(centre.progress.completed).toBe(0);
  });

  it("reviews care classification even when the childcare flag is false for an early-years provider", () => {
    const care = checklist({
      sector: "LEARNING_CENTRE",
      vertical: "PUBLIC_LEARNING_CENTRE",
      providerCategory: "EARLY_YEARS",
      childcare: false,
    });
    expect(
      care.items.find(
        (item) => item.requirement.id === "cze.children-group-route",
      )?.applicability,
    ).toBe("APPLICABLE");
    expect(
      care.items.find((item) => item.requirement.id === "cze.school-register")
        ?.applicability,
    ).toBe("NOT_APPLICABLE");
  });

  it("keeps a possible children's-group route unresolved when care has not been assessed", () => {
    const centre = checklist({
      sector: "LEARNING_CENTRE",
      vertical: "PUBLIC_LEARNING_CENTRE",
      providerCategory: "OUT_OF_SCHOOL",
      childcare: null,
    });
    expect(
      centre.items.find(
        (item) => item.requirement.id === "cze.children-group-route",
      )?.applicability,
    ).toBe("UNRESOLVED");
  });

  it("publishes only partial cells and preserves all earlier catalogue releases", () => {
    expect(catalogueSchema.safeParse(TRACKER_CATALOGUE).success).toBe(true);
    const cells = TRACKER_CATALOGUE.coverage.filter(
      (cell) => cell.jurisdiction === "CZ",
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
            requirement.jurisdiction === "CZ" && requirement.topic === topic,
        ),
      ).toBe(true);
    }
    expect(
      TRACKER_CATALOGUE.requirements.slice(
        0,
        catalogueV111.requirements.length,
      ),
    ).toEqual(catalogueV111.requirements);
    expect(
      TRACKER_CATALOGUE.sources.slice(0, catalogueV111.sources.length),
    ).toEqual(catalogueV111.sources);
  });
});
