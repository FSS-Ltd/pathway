import { TRACKER_TOPICS, type TrackerProfileInput } from "@pathway/types";
import { TRACKER_CATALOGUE, catalogueSchema } from "..";
import { catalogueV122 } from "../v1.22";
import { trackerProfileInput } from "../../tracker.dto";
import { buildTrackerChecklist } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";
import { luxembourgCommuneCodes } from "./locations";

function checklist(
  changes: Partial<TrackerProfileInput>,
  subdivisionCode = "LU-LAU2-0301",
) {
  const now = new Date(`${TRACKER_CATALOGUE.releasedAt}T12:00:00Z`);
  return buildTrackerChecklist({
    catalogue: TRACKER_CATALOGUE,
    profile: {
      version: 1,
      updatedAt: now.toISOString(),
      profile: trackerProfileInput.parse({ ...testProfile, ...changes }),
    },
    location: { countryCode: "LU", subdivisionCode },
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

describe("Luxembourg progressive national release", () => {
  it("separates private-school authorisation and ICCE from a non-ACE out-of-school centre", () => {
    const school = {
      sector: "SCHOOL" as const,
      providerCategory: "INDEPENDENT_SCHOOL" as const,
      icce: true,
    };
    expect(applicability("lux.private-school-authorisation", school)).toBe(
      "APPLICABLE",
    );
    expect(applicability("lux.icce-provider", school)).toBe("APPLICABLE");
    const centre = {
      sector: "LEARNING_CENTRE" as const,
      vertical: "PUBLIC_LEARNING_CENTRE" as const,
      providerCategory: "OUT_OF_SCHOOL" as const,
      fundingStatus: "PRIVATE" as const,
      icce: false,
    };
    expect(applicability("lux.private-school-authorisation", centre)).toBe(
      "NOT_APPLICABLE",
    );
    expect(applicability("lux.public-school-governance", centre)).toBe(
      "NOT_APPLICABLE",
    );
    expect(applicability("lux.out-of-school-programme", centre)).toBe(
      "APPLICABLE",
    );
    expect(applicability("lux.icce-provider", centre)).toBe("NOT_APPLICABLE");
  });

  it("keeps SEA, adult and role-specific routes conditional", () => {
    expect(applicability("lux.sea-approval", { childcare: true })).toBe(
      "APPLICABLE",
    );
    expect(
      applicability("lux.sea-approval", {
        childcare: false,
        providerCategory: "OUT_OF_SCHOOL",
      }),
    ).toBe("NOT_APPLICABLE");
    expect(
      applicability("lux.child-contact-checks", {
        minimumAge: 18,
        maximumAge: 30,
      }),
    ).toBe("NOT_APPLICABLE");
    expect(
      applicability("lux.adult-nationality-courses", { maximumAge: 30 }),
    ).toBe("APPLICABLE");
    expect(applicability("lux.commune-school-interface", {}, "")).toBe(
      "UNRESOLVED",
    );
  });

  it("keeps all local gaps visible while preserving the prior release", () => {
    expect(catalogueSchema.safeParse(TRACKER_CATALOGUE).success).toBe(true);
    expect(luxembourgCommuneCodes).toHaveLength(100);
    expect(new Set(luxembourgCommuneCodes).size).toBe(100);
    expect(
      new Set(luxembourgCommuneCodes.map((code) => code.slice(0, 2))).size,
    ).toBe(12);
    const cells = TRACKER_CATALOGUE.coverage.filter(
      (cell) => cell.jurisdiction === "LU",
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
            requirement.jurisdiction === "LU" && requirement.topic === topic,
        ),
      ).toBe(true);
    }
    expect(
      TRACKER_CATALOGUE.requirements.slice(
        0,
        catalogueV122.requirements.length,
      ),
    ).toEqual(catalogueV122.requirements);
    expect(
      TRACKER_CATALOGUE.sources.slice(0, catalogueV122.sources.length),
    ).toEqual(catalogueV122.sources);
    expect(checklist({}).coverageGaps).toBeGreaterThan(0);
  });
});
