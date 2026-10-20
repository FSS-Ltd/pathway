import { TRACKER_TOPICS, type TrackerProfileInput } from "@pathway/types";
import { TRACKER_CATALOGUE, catalogueSchema } from "..";
import { catalogueV119 } from "../v1.19";
import { trackerProfileInput } from "../../tracker.dto";
import { buildTrackerChecklist } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";
import { italyRegionCodes } from "./shared";

function checklist(
  changes: Partial<TrackerProfileInput>,
  subdivisionCode = "IT-62",
) {
  const now = new Date(`${TRACKER_CATALOGUE.releasedAt}T12:00:00Z`);
  return buildTrackerChecklist({
    catalogue: TRACKER_CATALOGUE,
    profile: {
      version: 1,
      updatedAt: now.toISOString(),
      profile: trackerProfileInput.parse({ ...testProfile, ...changes }),
    },
    location: { countryCode: "IT", subdivisionCode },
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

describe("Italy progressive national release", () => {
  it("checks a non-state school's regional legal route separately from ICCE", () => {
    const school = {
      sector: "SCHOOL" as const,
      providerCategory: "INDEPENDENT_SCHOOL" as const,
      icce: true,
    };
    for (const region of ["IT-62", "IT-21", "IT-TN", "IT-BZ"]) {
      expect(applicability("ita.non-state-school-route", school, region)).toBe(
        "APPLICABLE",
      );
    }
    expect(applicability("ita.non-state-school-route", school, "")).toBe(
      "UNRESOLVED",
    );
    expect(applicability("ita.icce-registration", school)).toBe("APPLICABLE");
    expect(applicability("ita.training-accreditation", school)).toBe(
      "NOT_APPLICABLE",
    );
  });

  it("routes a non-ACE Learning Centre to training assessment without assuming school recognition or public funding", () => {
    const centre = {
      sector: "LEARNING_CENTRE" as const,
      vertical: "PUBLIC_LEARNING_CENTRE" as const,
      providerCategory: "OUT_OF_SCHOOL" as const,
      fundingStatus: "PRIVATE" as const,
      childcare: false,
      icce: false,
    };
    expect(applicability("ita.non-state-school-route", centre)).toBe(
      "NOT_APPLICABLE",
    );
    expect(applicability("ita.training-accreditation", centre)).toBe(
      "APPLICABLE",
    );
    expect(applicability("ita.icce-registration", centre)).toBe(
      "NOT_APPLICABLE",
    );
    expect(checklist(centre).coverageGaps).toBeGreaterThan(0);
  });

  it("keeps nursery care classification uncertain and the hiring certificate role-specific", () => {
    const nursery = {
      sector: "SCHOOL" as const,
      vertical: "NURSERY" as const,
      providerCategory: "EARLY_YEARS" as const,
      childcare: true,
      minimumAge: 1,
      employsStaff: true,
    };
    expect(applicability("ita.early-years-authorisation", nursery)).toBe(
      "APPLICABLE",
    );
    expect(applicability("ita.child-contact-check", nursery)).toBe(
      "APPLICABLE",
    );
    expect(
      TRACKER_CATALOGUE.requirements.find(
        (requirement) => requirement.id === "ita.early-years-authorisation",
      ),
    ).toMatchObject({
      allowsNotApplicable: true,
      notApplicablePolicy: expect.stringContaining("municipality"),
    });
    expect(
      applicability("ita.early-years-authorisation", {
        providerCategory: "OTHER",
        childcare: null,
      }),
    ).toBe("UNRESOLVED");
    expect(
      applicability("ita.child-contact-check", {
        ...nursery,
        employsStaff: false,
      }),
    ).toBe("NOT_APPLICABLE");
    expect(
      applicability("ita.early-years-authorisation", {
        providerCategory: "STATE_SCHOOL",
        childcare: false,
      }),
    ).toBe("NOT_APPLICABLE");
  });

  it("keeps the Garante DPIA/DPO review conditional on controller status", () => {
    expect(
      applicability("ita.dpia-dpo-assessment", {
        personalDataController: true,
      }),
    ).toBe("APPLICABLE");
    expect(
      applicability("ita.dpia-dpo-assessment", {
        personalDataController: false,
      }),
    ).toBe("NOT_APPLICABLE");
    expect(
      TRACKER_CATALOGUE.requirements.find(
        (requirement) => requirement.id === "ita.dpia-dpo-assessment",
      ),
    ).toMatchObject({
      allowsNotApplicable: true,
      notApplicablePolicy: expect.stringContaining("Garante"),
    });
  });

  it("keeps regional gaps visible and preserves the Hungary release", () => {
    expect(catalogueSchema.safeParse(TRACKER_CATALOGUE).success).toBe(true);
    expect(italyRegionCodes).toHaveLength(22);
    const cells = TRACKER_CATALOGUE.coverage.filter(
      (cell) => cell.jurisdiction === "IT",
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
            requirement.jurisdiction === "IT" && requirement.topic === topic,
        ),
      ).toBe(true);
    }
    expect(
      TRACKER_CATALOGUE.requirements.slice(
        0,
        catalogueV119.requirements.length,
      ),
    ).toEqual(catalogueV119.requirements);
    expect(
      TRACKER_CATALOGUE.sources.slice(0, catalogueV119.sources.length),
    ).toEqual(catalogueV119.sources);
  });
});
