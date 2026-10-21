import { TRACKER_TOPICS, type TrackerProfileInput } from "@pathway/types";
import { TRACKER_CATALOGUE, catalogueSchema } from "..";
import { catalogueV125 } from "../v1.25";
import { trackerProfileInput } from "../../tracker.dto";
import { buildTrackerChecklist } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";

function checklist(
  changes: Partial<TrackerProfileInput>,
  subdivisionCode = "PL-TERC-1465011",
) {
  const now = new Date(`${TRACKER_CATALOGUE.releasedAt}T12:00:00Z`);
  return buildTrackerChecklist({
    catalogue: TRACKER_CATALOGUE,
    profile: {
      version: 1,
      updatedAt: now.toISOString(),
      profile: trackerProfileInput.parse({ ...testProfile, ...changes }),
    },
    location: { countryCode: "PL", subdivisionCode },
    attestations: [],
    evidenceCounts: {},
    now,
  });
}

function applicability(id: string, changes: Partial<TrackerProfileInput>) {
  return checklist(changes).items.find((item) => item.requirement.id === id)
    ?.applicability;
}

describe("Poland progressive national release", () => {
  it("separates non-public, public and out-of-school education without funding inference", () => {
    expect(
      applicability("pl.nonpublic-school-register", {
        sector: "SCHOOL",
        providerCategory: "INDEPENDENT_SCHOOL",
        fundingStatus: "PUBLIC",
      }),
    ).toBe("APPLICABLE");
    expect(
      applicability("pl.public-school-permission", {
        sector: "SCHOOL",
        providerCategory: "INDEPENDENT_SCHOOL",
        fundingStatus: "PUBLIC",
      }),
    ).toBe("NOT_APPLICABLE");
    const centre = {
      sector: "LEARNING_CENTRE" as const,
      vertical: "PUBLIC_LEARNING_CENTRE" as const,
      providerCategory: "OUT_OF_SCHOOL" as const,
      fundingStatus: "PRIVATE" as const,
    };
    expect(applicability("pl.public-school-permission", centre)).toBe(
      "NOT_APPLICABLE",
    );
    expect(applicability("pl.tuition-route", centre)).toBe("APPLICABLE");
  });

  it("separates municipal under-three care and preschool routes", () => {
    expect(
      applicability("pl.under3-register", {
        providerCategory: "CHILDCARE",
        childcare: true,
        minimumAge: 1,
      }),
    ).toBe("APPLICABLE");
    expect(
      applicability("pl.under3-standards", {
        providerCategory: "CHILDCARE",
        childcare: true,
        minimumAge: 1,
      }),
    ).toBe("APPLICABLE");
    expect(
      applicability("pl.preschool-register", {
        providerCategory: "EARLY_YEARS",
        childcare: false,
        minimumAge: 3,
      }),
    ).toBe("APPLICABLE");
    expect(
      applicability("pl.under3-register", {
        providerCategory: "EARLY_YEARS",
        childcare: false,
        minimumAge: 3,
      }),
    ).toBe("NOT_APPLICABLE");
  });

  it("uses actual child-facing activity for standards and role checks", () => {
    const club = {
      sector: "CLUB" as const,
      vertical: "CLUB" as const,
      providerCategory: "OUT_OF_SCHOOL" as const,
      minimumAge: 8,
    };
    expect(applicability("pl.child-protection-standards", club)).toBe(
      "APPLICABLE",
    );
    expect(applicability("pl.pre-engagement-checks", club)).toBe("APPLICABLE");
    expect(
      applicability("pl.organised-holiday", { ...club, trips: false }),
    ).toBe("APPLICABLE");
    expect(
      applicability("pl.pre-engagement-checks", {
        ...club,
        minimumAge: 18,
        maximumAge: 25,
      }),
    ).toBe("NOT_APPLICABLE");
    expect(
      applicability("pl.organised-holiday", {
        ...club,
        minimumAge: 18,
        maximumAge: 25,
      }),
    ).toBe("NOT_APPLICABLE");
  });

  it("publishes partial coverage and preserves the previous catalogue", () => {
    expect(catalogueSchema.safeParse(TRACKER_CATALOGUE).success).toBe(true);
    const cells = TRACKER_CATALOGUE.coverage.filter(
      (cell) => cell.jurisdiction === "PL",
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
            requirement.jurisdiction === "PL" && requirement.topic === topic,
        ),
      ).toBe(true);
    }
    expect(
      checklist({ region: null }).coverage.find(
        (cell) => cell.jurisdiction === "PL",
      )?.regionalStatus,
    ).toBe("UNAVAILABLE");
    expect(TRACKER_CATALOGUE.version).toBe("1.37.0");
    expect(TRACKER_CATALOGUE.sources).toEqual(
      expect.arrayContaining(catalogueV125.sources),
    );
    expect(TRACKER_CATALOGUE.requirements).toEqual(
      expect.arrayContaining(catalogueV125.requirements),
    );
  });
});
