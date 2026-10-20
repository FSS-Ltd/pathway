import { TRACKER_TOPICS, type TrackerProfileInput } from "@pathway/types";
import { TRACKER_CATALOGUE, catalogueSchema } from "..";
import { catalogueV117 } from "../v1.17";
import { trackerProfileInput } from "../../tracker.dto";
import { buildTrackerChecklist } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";

function checklist(
  changes: Partial<TrackerProfileInput>,
  subdivisionCode = "GR-I",
) {
  const now = new Date(`${TRACKER_CATALOGUE.releasedAt}T12:00:00Z`);
  return buildTrackerChecklist({
    catalogue: TRACKER_CATALOGUE,
    profile: {
      version: 1,
      updatedAt: now.toISOString(),
      profile: trackerProfileInput.parse({ ...testProfile, ...changes }),
    },
    location: { countryCode: "GR", subdivisionCode },
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

describe("Greece progressive national release", () => {
  it("requires a region for a licensed private school and keeps ICCE separate", () => {
    const school = {
      sector: "SCHOOL" as const,
      providerCategory: "INDEPENDENT_SCHOOL" as const,
      icce: true,
    };
    for (const region of ["GR-I", "GR-B", "GR-M", "GR-69"]) {
      expect(applicability("grc.private-school-licence", school, region)).toBe(
        "APPLICABLE",
      );
    }
    expect(applicability("grc.private-school-licence", school, "")).toBe(
      "UNRESOLVED",
    );
    expect(applicability("grc.tutoring-centre-notification", school)).toBe(
      "NOT_APPLICABLE",
    );
    expect(applicability("grc.icce-registration", school)).toBe("APPLICABLE");
  });

  it("routes a non-ACE Learning Centre to out-of-school review without assuming public funding or a child-protection entity", () => {
    const centre = {
      sector: "LEARNING_CENTRE" as const,
      vertical: "PUBLIC_LEARNING_CENTRE" as const,
      providerCategory: "OUT_OF_SCHOOL" as const,
      fundingStatus: "PRIVATE" as const,
      childcare: false,
      icce: false,
    };
    expect(applicability("grc.private-school-licence", centre)).toBe(
      "NOT_APPLICABLE",
    );
    expect(applicability("grc.tutoring-centre-notification", centre)).toBe(
      "APPLICABLE",
    );
    expect(applicability("grc.protection-officer", centre)).toBe(
      "NOT_APPLICABLE",
    );
    expect(applicability("grc.icce-registration", centre)).toBe(
      "NOT_APPLICABLE",
    );
    expect(checklist(centre).coverageGaps).toBeGreaterThan(0);
  });

  it("separates municipal preschool care from regional creative-activity care and leaves unknown care unresolved", () => {
    const nursery = {
      providerCategory: "EARLY_YEARS" as const,
      childcare: true,
    };
    const creative = {
      providerCategory: "CHILDCARE" as const,
      childcare: true,
    };
    expect(applicability("grc.preschool-care-licence", nursery)).toBe(
      "APPLICABLE",
    );
    expect(
      TRACKER_CATALOGUE.requirements.find(
        (requirement) => requirement.id === "grc.preschool-care-licence",
      ),
    ).toMatchObject({
      allowsNotApplicable: true,
      notApplicablePolicy: expect.stringContaining("municipality"),
    });
    expect(applicability("grc.creative-centre-licence", nursery)).toBe(
      "NOT_APPLICABLE",
    );
    expect(applicability("grc.creative-centre-licence", creative)).toBe(
      "APPLICABLE",
    );
    expect(applicability("grc.preschool-care-licence", creative)).toBe(
      "NOT_APPLICABLE",
    );
    expect(applicability("grc.protection-officer", nursery)).toBe("APPLICABLE");
    expect(applicability("grc.role-restrictions", nursery)).toBe("APPLICABLE");
    expect(
      applicability("grc.protection-officer", {
        providerCategory: "OTHER",
        childcare: null,
      }),
    ).toBe("UNRESOLVED");
  });

  it("keeps all regional gaps visible and preserves Germany's published history", () => {
    expect(catalogueSchema.safeParse(TRACKER_CATALOGUE).success).toBe(true);
    const cells = TRACKER_CATALOGUE.coverage.filter(
      (cell) => cell.jurisdiction === "GR",
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
            requirement.jurisdiction === "GR" && requirement.topic === topic,
        ),
      ).toBe(true);
    }
    expect(
      TRACKER_CATALOGUE.requirements.slice(
        0,
        catalogueV117.requirements.length,
      ),
    ).toEqual(catalogueV117.requirements);
    expect(
      TRACKER_CATALOGUE.sources.slice(0, catalogueV117.sources.length),
    ).toEqual(catalogueV117.sources);
  });
});
