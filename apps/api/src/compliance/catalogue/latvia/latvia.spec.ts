import { TRACKER_TOPICS, type TrackerProfileInput } from "@pathway/types";
import { TRACKER_CATALOGUE, catalogueSchema } from "..";
import { catalogueV120 } from "../v1.20";
import { trackerProfileInput } from "../../tracker.dto";
import { buildTrackerChecklist } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";
import { latviaAuthorityCodes } from "./shared";

function checklist(
  changes: Partial<TrackerProfileInput>,
  subdivisionCode = "LV-ATVK-0001000",
) {
  const now = new Date(`${TRACKER_CATALOGUE.releasedAt}T12:00:00Z`);
  return buildTrackerChecklist({
    catalogue: TRACKER_CATALOGUE,
    profile: {
      version: 1,
      updatedAt: now.toISOString(),
      profile: trackerProfileInput.parse({ ...testProfile, ...changes }),
    },
    location: { countryCode: "LV", subdivisionCode },
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

describe("Latvia progressive national release", () => {
  it("separates formal school registration from a non-ACE Learning Centre's municipal route", () => {
    const school = {
      sector: "SCHOOL" as const,
      providerCategory: "INDEPENDENT_SCHOOL" as const,
      icce: true,
    };
    expect(applicability("lva.education-registration", school)).toBe(
      "APPLICABLE",
    );
    expect(applicability("lva.icce-registration", school)).toBe("APPLICABLE");
    const centre = {
      sector: "LEARNING_CENTRE" as const,
      vertical: "PUBLIC_LEARNING_CENTRE" as const,
      providerCategory: "OUT_OF_SCHOOL" as const,
      fundingStatus: "PRIVATE" as const,
      icce: false,
    };
    expect(applicability("lva.education-registration", centre)).toBe(
      "NOT_APPLICABLE",
    );
    expect(applicability("lva.interest-education-route", centre)).toBe(
      "APPLICABLE",
    );
    expect(applicability("lva.icce-registration", centre)).toBe(
      "NOT_APPLICABLE",
    );
    expect(applicability("lva.interest-education-route", centre, "")).toBe(
      "UNRESOLVED",
    );
  });

  it("keeps child supervision distinct from formal preschool and annual checks role-based", () => {
    const childSupervision = {
      sector: "SCHOOL" as const,
      vertical: "NURSERY" as const,
      providerCategory: "CHILDCARE" as const,
      childcare: true,
      minimumAge: 2,
    };
    expect(
      applicability("lva.child-supervision-register", childSupervision),
    ).toBe("APPLICABLE");
    expect(
      applicability("lva.child-supervision-register", {
        ...childSupervision,
        providerCategory: "OUT_OF_SCHOOL",
      }),
    ).toBe("APPLICABLE");
    expect(applicability("lva.child-role-checks", childSupervision)).toBe(
      "APPLICABLE",
    );
    expect(
      applicability("lva.child-supervision-register", {
        ...childSupervision,
        providerCategory: "EARLY_YEARS",
      }),
    ).toBe("NOT_APPLICABLE");
    expect(
      applicability("lva.school-first-aid", {
        ...childSupervision,
        providerCategory: "EARLY_YEARS",
      }),
    ).toBe("APPLICABLE");
    expect(
      TRACKER_CATALOGUE.requirements.find(
        (requirement) => requirement.id === "lva.child-role-checks",
      ),
    ).toMatchObject({
      reviewCadenceDays: 365,
      allowsNotApplicable: true,
      notApplicablePolicy: expect.stringContaining("covered child setting"),
    });
  });

  it("does not treat an ordinary trip as a registered camp", () => {
    const schoolTrip = {
      providerCategory: "INDEPENDENT_SCHOOL" as const,
      trips: true,
    };
    expect(applicability("lva.camp-classification", schoolTrip)).toBe(
      "APPLICABLE",
    );
    expect(
      applicability("lva.camp-classification", {
        trips: false,
        boarding: false,
      }),
    ).toBe("APPLICABLE");
    expect(applicability("lva.school-trip-safety", schoolTrip)).toBe(
      "APPLICABLE",
    );
    expect(
      TRACKER_CATALOGUE.requirements.find(
        (requirement) => requirement.id === "lva.camp-permissions",
      ),
    ).toMatchObject({
      obligationClass: "STATUTORY_DUTY",
      allowsNotApplicable: true,
      notApplicablePolicy: expect.stringContaining("no covered camp"),
    });
  });

  it("keeps all municipal gaps visible and preserves Italy's published content", () => {
    expect(catalogueSchema.safeParse(TRACKER_CATALOGUE).success).toBe(true);
    expect(latviaAuthorityCodes).toHaveLength(42);
    expect(new Set(latviaAuthorityCodes).size).toBe(42);
    expect(latviaAuthorityCodes).toContain("0038001");
    const cells = TRACKER_CATALOGUE.coverage.filter(
      (cell) => cell.jurisdiction === "LV",
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
            requirement.jurisdiction === "LV" && requirement.topic === topic,
        ),
      ).toBe(true);
    }
    expect(
      TRACKER_CATALOGUE.requirements.slice(
        0,
        catalogueV120.requirements.length,
      ),
    ).toEqual(catalogueV120.requirements);
    expect(
      TRACKER_CATALOGUE.sources.slice(0, catalogueV120.sources.length),
    ).toEqual(catalogueV120.sources);
    expect(checklist({}).coverageGaps).toBeGreaterThan(0);
  });
});
