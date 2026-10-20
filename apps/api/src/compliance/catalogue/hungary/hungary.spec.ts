import { TRACKER_TOPICS, type TrackerProfileInput } from "@pathway/types";
import { TRACKER_CATALOGUE, catalogueSchema } from "..";
import { catalogueV118 } from "../v1.18";
import { trackerProfileInput } from "../../tracker.dto";
import { buildTrackerChecklist } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";

function checklist(
  changes: Partial<TrackerProfileInput>,
  subdivisionCode = "HU-BU",
) {
  const now = new Date(`${TRACKER_CATALOGUE.releasedAt}T12:00:00Z`);
  return buildTrackerChecklist({
    catalogue: TRACKER_CATALOGUE,
    profile: {
      version: 1,
      updatedAt: now.toISOString(),
      profile: trackerProfileInput.parse({ ...testProfile, ...changes }),
    },
    location: { countryCode: "HU", subdivisionCode },
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

describe("Hungary progressive national release", () => {
  it("requires a county for a non-state school while keeping ICCE independent", () => {
    const school = {
      sector: "SCHOOL" as const,
      providerCategory: "INDEPENDENT_SCHOOL" as const,
      icce: true,
    };
    for (const county of ["HU-BU", "HU-PE", "HU-CS", "HU-ZA"]) {
      expect(applicability("hun.non-state-school-permit", school, county)).toBe(
        "APPLICABLE",
      );
    }
    expect(applicability("hun.non-state-school-permit", school, "")).toBe(
      "UNRESOLVED",
    );
    expect(applicability("hun.training-route", school)).toBe("NOT_APPLICABLE");
    expect(applicability("hun.icce-registration", school)).toBe("APPLICABLE");
  });

  it("routes a non-ACE Learning Centre to training assessment without assuming school or public funding", () => {
    const centre = {
      sector: "LEARNING_CENTRE" as const,
      vertical: "PUBLIC_LEARNING_CENTRE" as const,
      providerCategory: "OUT_OF_SCHOOL" as const,
      fundingStatus: "PRIVATE" as const,
      childcare: false,
      icce: false,
    };
    expect(applicability("hun.non-state-school-permit", centre)).toBe(
      "NOT_APPLICABLE",
    );
    expect(applicability("hun.training-route", centre)).toBe("APPLICABLE");
    expect(applicability("hun.child-welfare-signal", centre)).toBe(
      "NOT_APPLICABLE",
    );
    expect(applicability("hun.icce-registration", centre)).toBe(
      "NOT_APPLICABLE",
    );
    expect(checklist(centre).coverageGaps).toBeGreaterThan(0);
  });

  it("distinguishes school kindergarten from childcare and does not silently dismiss uncertain care", () => {
    const care = {
      providerCategory: "EARLY_YEARS" as const,
      childcare: true,
    };
    expect(applicability("hun.childcare-registry", care)).toBe("APPLICABLE");
    expect(applicability("hun.care-personnel", care)).toBe("APPLICABLE");
    expect(
      TRACKER_CATALOGUE.requirements.find(
        (requirement) => requirement.id === "hun.childcare-registry",
      ),
    ).toMatchObject({
      allowsNotApplicable: true,
      notApplicablePolicy: expect.stringContaining("county"),
    });
    expect(
      applicability("hun.childcare-registry", {
        providerCategory: "OTHER",
        childcare: null,
      }),
    ).toBe("UNRESOLVED");
    expect(
      applicability("hun.childcare-registry", {
        providerCategory: "STATE_SCHOOL",
        childcare: false,
      }),
    ).toBe("NOT_APPLICABLE");
  });

  it("keeps county gaps visible and preserves the Greece release", () => {
    expect(catalogueSchema.safeParse(TRACKER_CATALOGUE).success).toBe(true);
    const cells = TRACKER_CATALOGUE.coverage.filter(
      (cell) => cell.jurisdiction === "HU",
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
            requirement.jurisdiction === "HU" && requirement.topic === topic,
        ),
      ).toBe(true);
    }
    expect(
      TRACKER_CATALOGUE.requirements.slice(
        0,
        catalogueV118.requirements.length,
      ),
    ).toEqual(catalogueV118.requirements);
    expect(
      TRACKER_CATALOGUE.sources.slice(0, catalogueV118.sources.length),
    ).toEqual(catalogueV118.sources);
  });
});
