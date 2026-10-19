import { TRACKER_TOPICS, type TrackerProfileInput } from "@pathway/types";
import { TRACKER_CATALOGUE, catalogueSchema } from "..";
import { catalogueV112 } from "../v1.12";
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
    location: { countryCode: "DK", subdivisionCode: "" },
    attestations: [],
    evidenceCounts: {},
    now,
  });
}

describe("Denmark progressive national release", () => {
  it("separates an independent school and ICCE from a non-ACE learning centre", () => {
    const school = checklist({
      sector: "SCHOOL",
      providerCategory: "INDEPENDENT_SCHOOL",
      fundingStatus: "PRIVATE",
      ace: true,
      icce: true,
    });
    expect(
      school.items.find(
        (item) => item.requirement.id === "dnk.free-school-route",
      )?.applicability,
    ).toBe("APPLICABLE");
    expect(
      school.items.find(
        (item) => item.requirement.id === "dnk.icce-registration",
      )?.applicability,
    ).toBe("APPLICABLE");
    const centre = checklist({
      sector: "LEARNING_CENTRE",
      vertical: "PUBLIC_LEARNING_CENTRE",
      providerCategory: "OUT_OF_SCHOOL",
      fundingStatus: "PRIVATE",
      childcare: false,
      ace: false,
      icce: false,
    });
    expect(
      centre.items.find(
        (item) => item.requirement.id === "dnk.free-school-route",
      )?.applicability,
    ).toBe("NOT_APPLICABLE");
    expect(
      centre.items.find((item) => item.requirement.id === "dnk.daycare-route")
        ?.applicability,
    ).toBe("NOT_APPLICABLE");
    expect(
      centre.items.find(
        (item) => item.requirement.id === "dnk.icce-registration",
      )?.applicability,
    ).toBe("NOT_APPLICABLE");
    expect(centre.coverageGaps).toBe(8);
    expect(centre.progress.completed).toBe(0);
  });

  it("keeps unknown childcare unresolved and early-years care relevant", () => {
    const unknown = checklist({
      sector: "LEARNING_CENTRE",
      vertical: "PUBLIC_LEARNING_CENTRE",
      providerCategory: "OUT_OF_SCHOOL",
      childcare: null,
    });
    expect(
      unknown.items.find((item) => item.requirement.id === "dnk.daycare-route")
        ?.applicability,
    ).toBe("UNRESOLVED");
    const earlyYears = checklist({
      sector: "LEARNING_CENTRE",
      vertical: "PUBLIC_LEARNING_CENTRE",
      providerCategory: "EARLY_YEARS",
      childcare: false,
    });
    expect(
      earlyYears.items.find(
        (item) => item.requirement.id === "dnk.daycare-route",
      )?.applicability,
    ).toBe("APPLICABLE");
  });

  it("limits the child-certificate review to possible under-15 contact", () => {
    expect(
      checklist({ minimumAge: 14 }).items.find(
        (item) => item.requirement.id === "dnk.child-certificate",
      )?.applicability,
    ).toBe("APPLICABLE");
    expect(
      checklist({ minimumAge: 15 }).items.find(
        (item) => item.requirement.id === "dnk.child-certificate",
      )?.applicability,
    ).toBe("NOT_APPLICABLE");
  });

  it("publishes partial coverage while preserving every earlier release", () => {
    expect(catalogueSchema.safeParse(TRACKER_CATALOGUE).success).toBe(true);
    const cells = TRACKER_CATALOGUE.coverage.filter(
      (cell) => cell.jurisdiction === "DK",
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
            requirement.jurisdiction === "DK" && requirement.topic === topic,
        ),
      ).toBe(true);
    }
    expect(
      TRACKER_CATALOGUE.requirements.slice(
        0,
        catalogueV112.requirements.length,
      ),
    ).toEqual(catalogueV112.requirements);
    expect(
      TRACKER_CATALOGUE.sources.slice(0, catalogueV112.sources.length),
    ).toEqual(catalogueV112.sources);
  });
});
