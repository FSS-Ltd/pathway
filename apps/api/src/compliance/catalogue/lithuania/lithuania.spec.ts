import { TRACKER_TOPICS, type TrackerProfileInput } from "@pathway/types";
import { TRACKER_CATALOGUE, catalogueSchema } from "..";
import { catalogueV121 } from "../v1.21";
import { trackerProfileInput } from "../../tracker.dto";
import { buildTrackerChecklist } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";
import { lithuaniaMunicipalityCodes } from "./locations";
import { firstWaveAdmissionsMunicipalities } from "./shared";

function checklist(
  changes: Partial<TrackerProfileInput>,
  subdivisionCode = "LT-SAV-13",
) {
  const now = new Date(`${TRACKER_CATALOGUE.releasedAt}T12:00:00Z`);
  return buildTrackerChecklist({
    catalogue: TRACKER_CATALOGUE,
    profile: {
      version: 1,
      updatedAt: now.toISOString(),
      profile: trackerProfileInput.parse({ ...testProfile, ...changes }),
    },
    location: { countryCode: "LT", subdivisionCode },
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

describe("Lithuania progressive national release", () => {
  it("separates formal school duties from a private non-formal Learning Centre", () => {
    const school = {
      sector: "SCHOOL" as const,
      providerCategory: "INDEPENDENT_SCHOOL" as const,
      icce: true,
    };
    expect(applicability("ltu.formal-institution-register", school)).toBe(
      "APPLICABLE",
    );
    expect(applicability("ltu.foreign-programme-consent", school)).toBe(
      "APPLICABLE",
    );
    const centre = {
      sector: "LEARNING_CENTRE" as const,
      vertical: "PUBLIC_LEARNING_CENTRE" as const,
      providerCategory: "OUT_OF_SCHOOL" as const,
      fundingStatus: "PRIVATE" as const,
      icce: false,
    };
    expect(applicability("ltu.formal-institution-register", centre)).toBe(
      "NOT_APPLICABLE",
    );
    expect(applicability("ltu.nonformal-provider-route", centre)).toBe(
      "APPLICABLE",
    );
    expect(
      TRACKER_CATALOGUE.requirements.find(
        (item) => item.id === "ltu.nonformal-provider-route",
      ),
    ).toMatchObject({
      obligationClass: "STATUTORY_DUTY",
      sourceIds: expect.arrayContaining(["ltu-institution-register"]),
    });
    expect(applicability("ltu.nonformal-funding", centre)).toBe(
      "NOT_APPLICABLE",
    );
    expect(applicability("ltu.nonformal-provider-route", centre, "")).toBe(
      "UNRESOLVED",
    );
  });

  it("keeps preschool, school and camp health-safety routes distinct", () => {
    const preschool = {
      providerCategory: "EARLY_YEARS" as const,
      minimumAge: 2,
      childcare: true,
    };
    expect(applicability("ltu.preschool-hygiene-passport", preschool)).toBe(
      "APPLICABLE",
    );
    expect(applicability("ltu.school-hygiene-passport", preschool)).toBe(
      "NOT_APPLICABLE",
    );
    expect(applicability("ltu.preschool-local-admissions", preschool, "")).toBe(
      "UNRESOLVED",
    );
    expect(
      applicability(
        "ltu.first-wave-central-admissions",
        preschool,
        "LT-SAV-32",
      ),
    ).toBe("APPLICABLE");
    expect(
      applicability(
        "ltu.first-wave-central-admissions",
        preschool,
        "LT-SAV-13",
      ),
    ).toBe("NOT_APPLICABLE");
    expect(
      applicability("ltu.camp-health-safety", {
        ...preschool,
        trips: true,
      }),
    ).toBe("APPLICABLE");
    expect(
      TRACKER_CATALOGUE.requirements.find(
        (item) => item.id === "ltu.camp-health-safety",
      ),
    ).toMatchObject({
      allowsNotApplicable: true,
      notApplicablePolicy: expect.stringContaining("no covered camp"),
    });
  });

  it("limits child-work checks to covered roles and keeps annual review explicit", () => {
    const item = TRACKER_CATALOGUE.requirements.find(
      (requirement) => requirement.id === "ltu.child-work-qr-checks",
    );
    expect(item).toMatchObject({
      obligationClass: "STATUTORY_DUTY",
      reviewCadenceDays: 365,
      signalKeys: ["personnel"],
      allowsNotApplicable: true,
    });
    expect(item?.applicabilityExplanation).toContain(
      "An adult portal account alone is not a work role",
    );
    expect(
      applicability("ltu.child-work-qr-checks", {
        minimumAge: 18,
        maximumAge: 30,
      }),
    ).toBe("NOT_APPLICABLE");
  });

  it("keeps all municipality gaps visible and preserves the previous release", () => {
    expect(catalogueSchema.safeParse(TRACKER_CATALOGUE).success).toBe(true);
    expect(lithuaniaMunicipalityCodes).toHaveLength(60);
    expect(new Set(lithuaniaMunicipalityCodes).size).toBe(60);
    expect(firstWaveAdmissionsMunicipalities).toHaveLength(24);
    expect(
      firstWaveAdmissionsMunicipalities.every((code) =>
        lithuaniaMunicipalityCodes.includes(code),
      ),
    ).toBe(true);
    const cells = TRACKER_CATALOGUE.coverage.filter(
      (cell) => cell.jurisdiction === "LT",
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
            requirement.jurisdiction === "LT" && requirement.topic === topic,
        ),
      ).toBe(true);
    }
    expect(
      TRACKER_CATALOGUE.requirements.slice(
        0,
        catalogueV121.requirements.length,
      ),
    ).toEqual(catalogueV121.requirements);
    expect(
      TRACKER_CATALOGUE.sources.slice(0, catalogueV121.sources.length),
    ).toEqual(catalogueV121.sources);
    expect(checklist({}).coverageGaps).toBeGreaterThan(0);
  });
});
