import { TRACKER_TOPICS, type TrackerProfileInput } from "@pathway/types";
import { TRACKER_CATALOGUE, catalogueSchema } from "..";
import { catalogueV115 } from "../v1.15";
import { trackerProfileInput } from "../../tracker.dto";
import { buildTrackerChecklist } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";

function checklist(
  changes: Partial<TrackerProfileInput>,
  subdivisionCode = "FR-75",
) {
  const now = new Date("2026-10-19T12:00:00Z");
  return buildTrackerChecklist({
    catalogue: TRACKER_CATALOGUE,
    profile: {
      version: 1,
      updatedAt: now.toISOString(),
      profile: trackerProfileInput.parse({ ...testProfile, ...changes }),
    },
    location: { countryCode: "FR", subdivisionCode },
    attestations: [],
    evidenceCounts: {},
    now,
  });
}

function applicability(
  id: string,
  changes: Partial<TrackerProfileInput>,
  subdivisionCode?: string,
) {
  return checklist(changes, subdivisionCode).items.find(
    (item) => item.requirement.id === id,
  )?.applicability;
}

describe("France progressive national release", () => {
  const school = {
    sector: "SCHOOL" as const,
    providerCategory: "INDEPENDENT_SCHOOL" as const,
  };

  it("separates the general private-school route from Alsace-Moselle authorisation", () => {
    expect(
      applicability("fra.private-school-declaration", school, "FR-75"),
    ).toBe("APPLICABLE");
    expect(
      applicability("fra.local-law-school-authorisation", school, "FR-75"),
    ).toBe("NOT_APPLICABLE");
    for (const department of ["FR-57", "FR-67", "FR-68"]) {
      expect(
        applicability("fra.private-school-declaration", school, department),
      ).toBe("NOT_APPLICABLE");
      expect(
        applicability("fra.local-law-school-authorisation", school, department),
      ).toBe("APPLICABLE");
    }
    expect(applicability("fra.private-school-declaration", school, "")).toBe(
      "UNRESOLVED",
    );
    expect(
      applicability("fra.local-law-school-authorisation", school, ""),
    ).toBe("UNRESOLVED");
  });

  it("does not turn a non-ACE learning centre into a funded school", () => {
    const centre = {
      sector: "LEARNING_CENTRE" as const,
      vertical: "PUBLIC_LEARNING_CENTRE" as const,
      providerCategory: "OUT_OF_SCHOOL" as const,
      fundingStatus: "PRIVATE" as const,
      childcare: false,
      icce: false,
    };
    expect(applicability("fra.private-school-declaration", centre)).toBe(
      "NOT_APPLICABLE",
    );
    expect(applicability("fra.eaje-authorisation", centre)).toBe(
      "NOT_APPLICABLE",
    );
    expect(applicability("fra.icce-registration", centre)).toBe(
      "NOT_APPLICABLE",
    );
    expect(checklist(centre).coverageGaps).toBeGreaterThan(0);
  });

  it("applies under-six care and ICCE only when the site provides them", () => {
    expect(
      applicability("fra.eaje-authorisation", {
        childcare: true,
        minimumAge: 3,
      }),
    ).toBe("APPLICABLE");
    expect(
      applicability("fra.eaje-authorisation", {
        childcare: true,
        minimumAge: 8,
      }),
    ).toBe("NOT_APPLICABLE");
    expect(applicability("fra.icce-registration", { icce: true })).toBe(
      "APPLICABLE",
    );
  });

  it("publishes partial coverage and preserves the preceding release", () => {
    expect(catalogueSchema.safeParse(TRACKER_CATALOGUE).success).toBe(true);
    const cells = TRACKER_CATALOGUE.coverage.filter(
      (cell) => cell.jurisdiction === "FR",
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
            requirement.jurisdiction === "FR" && requirement.topic === topic,
        ),
      ).toBe(true);
    }
    expect(
      TRACKER_CATALOGUE.requirements.slice(
        0,
        catalogueV115.requirements.length,
      ),
    ).toEqual(catalogueV115.requirements);
    expect(
      TRACKER_CATALOGUE.sources.slice(0, catalogueV115.sources.length),
    ).toEqual(catalogueV115.sources);
  });
});
