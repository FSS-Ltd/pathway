import { TRACKER_TOPICS, type TrackerProfileInput } from "@pathway/types";
import { TRACKER_CATALOGUE, catalogueSchema } from "..";
import { trackerProfileInput } from "../../tracker.dto";
import { buildTrackerChecklist } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";
import { sloveniaRegionCodes } from ".";
import { catalogueV129 } from "../v1.29";

function checklist(changes: Partial<TrackerProfileInput>, region = "SI041") {
  const now = new Date(`${TRACKER_CATALOGUE.releasedAt}T12:00:00Z`);
  return buildTrackerChecklist({
    catalogue: TRACKER_CATALOGUE,
    profile: {
      version: 1,
      updatedAt: now.toISOString(),
      profile: trackerProfileInput.parse({ ...testProfile, ...changes }),
    },
    location: {
      countryCode: "SI",
      subdivisionCode: region,
      jurisdictionCodes: region ? [region, "SI"] : ["SI"],
    },
    attestations: [],
    evidenceCounts: {},
    now,
  });
}

function applicability(id: string, changes: Partial<TrackerProfileInput>) {
  return checklist(changes).items.find((item) => item.requirement.id === id)
    ?.applicability;
}

describe("Slovenia partial national and statistical-region release", () => {
  it("uses actual school or childcare status rather than ACE, funding or screens", () => {
    expect(
      applicability("si.education-register", {
        providerCategory: "INDEPENDENT_SCHOOL",
        fundingStatus: "PRIVATE",
        ace: true,
      }),
    ).toBe("APPLICABLE");
    expect(
      applicability("si.education-register", {
        sector: "LEARNING_CENTRE",
        vertical: "PUBLIC_LEARNING_CENTRE",
        providerCategory: "OUT_OF_SCHOOL",
        fundingStatus: "PRIVATE",
        ace: false,
      }),
    ).toBe("NOT_APPLICABLE");
    expect(
      applicability("si.preschool-registration", {
        providerCategory: "CHILDCARE",
        minimumAge: 1,
      }),
    ).toBe("APPLICABLE");
  });

  it("limits staff conditions and ICCE terms to their actual roles and provision", () => {
    expect(
      applicability("si.education-staff-conditions", {
        providerCategory: "OUT_OF_SCHOOL",
      }),
    ).toBe("NOT_APPLICABLE");
    expect(applicability("si.icce-provider", { icce: true })).toBe(
      "APPLICABLE",
    );
    expect(applicability("si.icce-provider", { ace: true, icce: false })).toBe(
      "NOT_APPLICABLE",
    );
  });

  it("keeps incomplete local coverage visible without changing earlier packs", () => {
    expect(catalogueSchema.safeParse(TRACKER_CATALOGUE).success).toBe(true);
    expect(sloveniaRegionCodes).toHaveLength(12);
    const cells = TRACKER_CATALOGUE.coverage.filter((cell) =>
      ["SI", ...sloveniaRegionCodes].includes(cell.jurisdiction),
    );
    expect(cells).toHaveLength(13 * 6 * TRACKER_TOPICS.length);
    expect(
      cells
        .filter((cell) => cell.jurisdiction === "SI")
        .every((cell) => cell.status === "PARTIALLY_PUBLISHED"),
    ).toBe(true);
    expect(
      cells
        .filter((cell) => cell.jurisdiction !== "SI")
        .every((cell) =>
          ["PARTIALLY_PUBLISHED", "IN_REVIEW"].includes(cell.status),
        ),
    ).toBe(true);
    expect(TRACKER_CATALOGUE.requirements).toEqual(
      expect.arrayContaining(catalogueV129.requirements),
    );
    expect(TRACKER_CATALOGUE.version).toBe("1.31.0");
  });

  it("does not select a regional action without a confirmed region", () => {
    const result = checklist({ providerCategory: "INDEPENDENT_SCHOOL" }, "");
    expect(
      result.items.some((item) =>
        item.requirement.id.startsWith("si.regional-school-route-"),
      ),
    ).toBe(false);
    expect(
      result.coverage.find((cell) => cell.jurisdiction === "SI")
        ?.regionalStatus,
    ).toBe("UNAVAILABLE");
  });
});
