import { TRACKER_TOPICS, type TrackerProfileInput } from "@pathway/types";
import { TRACKER_CATALOGUE, catalogueSchema } from "..";
import { catalogueV113 } from "../v1.13";
import { trackerProfileInput } from "../../tracker.dto";
import { buildTrackerChecklist } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";

function checklist(changes: Partial<TrackerProfileInput>) {
  const now = new Date(`${TRACKER_CATALOGUE.releasedAt}T12:00:00Z`);
  return buildTrackerChecklist({
    catalogue: TRACKER_CATALOGUE,
    profile: {
      version: 1,
      updatedAt: now.toISOString(),
      profile: trackerProfileInput.parse({ ...testProfile, ...changes }),
    },
    location: { countryCode: "EE", subdivisionCode: "" },
    attestations: [],
    evidenceCounts: {},
    now,
  });
}

describe("Estonia progressive national release", () => {
  it("separates legal school status and ICCE from a non-ACE learning centre", () => {
    const school = checklist({
      sector: "SCHOOL",
      providerCategory: "INDEPENDENT_SCHOOL",
      fundingStatus: "PRIVATE",
      ace: true,
      icce: true,
    });
    expect(
      school.items.find(
        (item) => item.requirement.id === "est.private-school-licence",
      )?.applicability,
    ).toBe("APPLICABLE");
    expect(
      school.items.find(
        (item) => item.requirement.id === "est.icce-registration",
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
        (item) => item.requirement.id === "est.private-school-licence",
      )?.applicability,
    ).toBe("NOT_APPLICABLE");
    expect(
      centre.items.find(
        (item) => item.requirement.id === "est.early-childhood-route",
      )?.applicability,
    ).toBe("NOT_APPLICABLE");
    expect(
      centre.items.find(
        (item) => item.requirement.id === "est.icce-registration",
      )?.applicability,
    ).toBe("NOT_APPLICABLE");
    expect(centre.coverageGaps).toBe(8);
    expect(centre.progress.completed).toBe(0);
  });

  it("keeps unknown childcare unresolved and early-years provision relevant", () => {
    expect(
      checklist({
        sector: "LEARNING_CENTRE",
        vertical: "PUBLIC_LEARNING_CENTRE",
        providerCategory: "OUT_OF_SCHOOL",
        childcare: null,
      }).items.find(
        (item) => item.requirement.id === "est.early-childhood-route",
      )?.applicability,
    ).toBe("UNRESOLVED");
    expect(
      checklist({
        sector: "LEARNING_CENTRE",
        vertical: "PUBLIC_LEARNING_CENTRE",
        providerCategory: "EARLY_YEARS",
        childcare: false,
      }).items.find(
        (item) => item.requirement.id === "est.early-childhood-route",
      )?.applicability,
    ).toBe("APPLICABLE");
  });

  it("keeps child-work restriction review tied to child contact", () => {
    expect(
      checklist({ minimumAge: 17 }).items.find(
        (item) => item.requirement.id === "est.child-work-restrictions",
      )?.applicability,
    ).toBe("APPLICABLE");
    expect(
      checklist({ minimumAge: 18 }).items.find(
        (item) => item.requirement.id === "est.child-work-restrictions",
      )?.applicability,
    ).toBe("NOT_APPLICABLE");
  });

  it("publishes partial coverage while preserving earlier releases", () => {
    expect(catalogueSchema.safeParse(TRACKER_CATALOGUE).success).toBe(true);
    const cells = TRACKER_CATALOGUE.coverage.filter(
      (cell) => cell.jurisdiction === "EE",
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
            requirement.jurisdiction === "EE" && requirement.topic === topic,
        ),
      ).toBe(true);
    }
    expect(
      TRACKER_CATALOGUE.requirements.slice(
        0,
        catalogueV113.requirements.length,
      ),
    ).toEqual(catalogueV113.requirements);
    expect(
      TRACKER_CATALOGUE.sources.slice(0, catalogueV113.sources.length),
    ).toEqual(catalogueV113.sources);
  });
});
