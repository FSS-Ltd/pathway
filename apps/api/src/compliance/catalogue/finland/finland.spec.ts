import { TRACKER_TOPICS, type TrackerProfileInput } from "@pathway/types";
import { TRACKER_CATALOGUE, catalogueSchema } from "..";
import { catalogueV114 } from "../v1.14";
import { trackerProfileInput } from "../../tracker.dto";
import { buildTrackerChecklist } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";

function checklist(
  changes: Partial<TrackerProfileInput>,
  subdivisionCode = "FI-18",
) {
  const now = new Date(`${TRACKER_CATALOGUE.releasedAt}T12:00:00Z`);
  return buildTrackerChecklist({
    catalogue: TRACKER_CATALOGUE,
    profile: {
      version: 1,
      updatedAt: now.toISOString(),
      profile: trackerProfileInput.parse({ ...testProfile, ...changes }),
    },
    location: { countryCode: "FI", subdivisionCode },
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

describe("Finland progressive national release", () => {
  it("separates formal school status and ICCE from a non-ACE learning centre", () => {
    expect(
      applicability("fin.private-basic-school", {
        sector: "SCHOOL",
        providerCategory: "INDEPENDENT_SCHOOL",
        icce: true,
      }),
    ).toBe("APPLICABLE");
    expect(applicability("fin.icce-registration", { icce: true })).toBe(
      "APPLICABLE",
    );
    const centre = {
      sector: "LEARNING_CENTRE" as const,
      vertical: "PUBLIC_LEARNING_CENTRE" as const,
      providerCategory: "OUT_OF_SCHOOL" as const,
      fundingStatus: "PRIVATE" as const,
      childcare: false,
      icce: false,
    };
    expect(applicability("fin.private-basic-school", centre)).toBe(
      "NOT_APPLICABLE",
    );
    expect(applicability("fin.private-ecec-route", centre)).toBe(
      "NOT_APPLICABLE",
    );
    expect(applicability("fin.icce-registration", centre)).toBe(
      "NOT_APPLICABLE",
    );
    expect(checklist(centre).coverageGaps).toBe(16);
  });

  it("keeps childcare and missing regional facts unresolved", () => {
    const centre = {
      sector: "LEARNING_CENTRE" as const,
      vertical: "PUBLIC_LEARNING_CENTRE" as const,
      providerCategory: "OUT_OF_SCHOOL" as const,
      childcare: null,
    };
    expect(applicability("fin.private-ecec-route", centre)).toBe("UNRESOLVED");
    expect(
      applicability("fin.private-ecec-route", { childcare: true }, ""),
    ).toBe("UNRESOLVED");
    expect(
      applicability("fin.private-ecec-route", { childcare: true }, "FI-18"),
    ).toBe("APPLICABLE");
  });

  it("does not present mainland school or care routes as Åland obligations", () => {
    expect(
      applicability(
        "fin.private-basic-school",
        {
          providerCategory: "INDEPENDENT_SCHOOL",
        },
        "FI-01",
      ),
    ).toBe("NOT_APPLICABLE");
    expect(
      applicability("fin.private-ecec-route", { childcare: true }, "FI-01"),
    ).toBe("NOT_APPLICABLE");
    expect(
      checklist({ childcare: true }, "FI-01").coverageGaps,
    ).toBeGreaterThan(0);
  });

  it("publishes partial coverage and preserves all earlier releases", () => {
    expect(catalogueSchema.safeParse(TRACKER_CATALOGUE).success).toBe(true);
    const cells = TRACKER_CATALOGUE.coverage.filter(
      (cell) => cell.jurisdiction === "FI",
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
            requirement.jurisdiction === "FI" && requirement.topic === topic,
        ),
      ).toBe(true);
    }
    expect(
      TRACKER_CATALOGUE.requirements.slice(
        0,
        catalogueV114.requirements.length,
      ),
    ).toEqual(catalogueV114.requirements);
    expect(
      TRACKER_CATALOGUE.sources.slice(0, catalogueV114.sources.length),
    ).toEqual(catalogueV114.sources);
  });
});
