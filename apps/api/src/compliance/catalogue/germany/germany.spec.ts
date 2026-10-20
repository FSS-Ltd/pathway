import { TRACKER_TOPICS, type TrackerProfileInput } from "@pathway/types";
import { TRACKER_CATALOGUE, catalogueSchema } from "..";
import { catalogueV116 } from "../v1.16";
import { trackerProfileInput } from "../../tracker.dto";
import { buildTrackerChecklist } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";

function checklist(
  changes: Partial<TrackerProfileInput>,
  subdivisionCode = "DE-BE",
) {
  const now = new Date("2026-10-20T12:00:00Z");
  return buildTrackerChecklist({
    catalogue: TRACKER_CATALOGUE,
    profile: {
      version: 1,
      updatedAt: now.toISOString(),
      profile: trackerProfileInput.parse({ ...testProfile, ...changes }),
    },
    location: { countryCode: "DE", subdivisionCode },
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

describe("Germany progressive national release", () => {
  const school = {
    sector: "SCHOOL" as const,
    providerCategory: "INDEPENDENT_SCHOOL" as const,
  };

  it("requires Land classification for private-school actions", () => {
    for (const land of ["DE-BE", "DE-BY", "DE-NW", "DE-TH"]) {
      expect(applicability("deu.private-school-approval", school, land)).toBe(
        "APPLICABLE",
      );
      expect(applicability("deu.land-school-education", school, land)).toBe(
        "APPLICABLE",
      );
    }
    expect(applicability("deu.private-school-approval", school, "")).toBe(
      "UNRESOLVED",
    );
    expect(applicability("deu.land-school-education", school, "")).toBe(
      "UNRESOLVED",
    );
  });

  it("does not classify a non-ACE Learning Centre as a school or automatically require a youth permit", () => {
    const centre = {
      sector: "LEARNING_CENTRE" as const,
      vertical: "PUBLIC_LEARNING_CENTRE" as const,
      providerCategory: "OUT_OF_SCHOOL" as const,
      fundingStatus: "PRIVATE" as const,
      childcare: false,
      icce: false,
    };
    expect(applicability("deu.private-school-approval", centre)).toBe(
      "NOT_APPLICABLE",
    );
    expect(applicability("deu.youth-establishment-permit", centre)).toBe(
      "NOT_APPLICABLE",
    );
    expect(applicability("deu.icce-registration", centre)).toBe(
      "NOT_APPLICABLE",
    );
    expect(checklist(centre).coverageGaps).toBeGreaterThan(0);
  });

  it("leaves uncertain childcare unresolved and applies provider terms only to participants", () => {
    expect(
      applicability("deu.youth-establishment-permit", { childcare: null }),
    ).toBe("UNRESOLVED");
    expect(
      applicability("deu.youth-establishment-permit", { childcare: true }),
    ).toBe("APPLICABLE");
    expect(applicability("deu.icce-registration", { icce: true })).toBe(
      "APPLICABLE",
    );
  });

  it("keeps all Länder gaps visible and preserves the France release", () => {
    expect(catalogueSchema.safeParse(TRACKER_CATALOGUE).success).toBe(true);
    const cells = TRACKER_CATALOGUE.coverage.filter(
      (cell) => cell.jurisdiction === "DE",
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
            requirement.jurisdiction === "DE" && requirement.topic === topic,
        ),
      ).toBe(true);
    }
    expect(
      TRACKER_CATALOGUE.requirements.slice(
        0,
        catalogueV116.requirements.length,
      ),
    ).toEqual(catalogueV116.requirements);
    expect(
      TRACKER_CATALOGUE.sources.slice(0, catalogueV116.sources.length),
    ).toEqual(catalogueV116.sources);
  });
});
