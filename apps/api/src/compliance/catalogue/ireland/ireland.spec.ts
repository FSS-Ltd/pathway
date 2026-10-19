import { TRACKER_TOPICS, type TrackerProfileInput } from "@pathway/types";
import { TRACKER_CATALOGUE, catalogueSchema } from "..";
import { catalogueV15 } from "../v1.5";
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
    location: { countryCode: "IE", subdivisionCode: "" },
    attestations: [],
    evidenceCounts: {},
    now,
  });
}

describe("Ireland progressive national release", () => {
  it("separates non-recognised school family guidance from actual ICCE participation", () => {
    const school = checklist({
      sector: "SCHOOL",
      providerCategory: "INDEPENDENT_SCHOOL",
      ace: true,
      icce: true,
    });
    expect(
      school.items.find(
        (item) => item.requirement.id === "irl.non-recognised-school-families",
      )?.applicability,
    ).toBe("APPLICABLE");
    expect(
      school.items.find(
        (item) => item.requirement.id === "irl.icce-registration",
      )?.applicability,
    ).toBe("APPLICABLE");
    expect(
      school.items.find(
        (item) => item.requirement.id === "irl.non-recognised-school-families",
      )?.requirement.obligationClass,
    ).toBe("RECOMMENDATION");
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
        (item) => item.requirement.id === "irl.non-recognised-school-families",
      )?.applicability,
    ).toBe("NOT_APPLICABLE");
    expect(
      centre.items.find(
        (item) => item.requirement.id === "irl.icce-registration",
      )?.applicability,
    ).toBe("NOT_APPLICABLE");
    expect(
      centre.items.find(
        (item) => item.requirement.id === "irl.recognised-curriculum",
      )?.applicability,
    ).toBe("NOT_APPLICABLE");
    expect(centre.coverageGaps).toBe(8);
  });

  it("keeps registration and operating standards together for a classified care provider", () => {
    const care = checklist({
      sector: "LEARNING_CENTRE",
      vertical: "PUBLIC_LEARNING_CENTRE",
      providerCategory: "CHILDCARE",
      childcare: false,
    });
    expect(
      care.items.find(
        (item) => item.requirement.id === "irl.tusla-care-registration",
      )?.applicability,
    ).toBe("APPLICABLE");
    expect(
      care.items.find(
        (item) => item.requirement.id === "irl.registered-care-standards",
      )?.applicability,
    ).toBe("APPLICABLE");
  });

  it("publishes partial cells across every sector and topic without changing UK history", () => {
    expect(catalogueSchema.safeParse(TRACKER_CATALOGUE).success).toBe(true);
    const cells = TRACKER_CATALOGUE.coverage.filter(
      (cell) => cell.jurisdiction === "IE",
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
            requirement.jurisdiction === "IE" && requirement.topic === topic,
        ),
      ).toBe(true);
    }
    expect(
      TRACKER_CATALOGUE.requirements.slice(0, catalogueV15.requirements.length),
    ).toEqual(catalogueV15.requirements);
    expect(
      TRACKER_CATALOGUE.sources.slice(0, catalogueV15.sources.length),
    ).toEqual(catalogueV15.sources);
  });
});
