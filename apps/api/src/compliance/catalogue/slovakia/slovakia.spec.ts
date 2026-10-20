import { TRACKER_TOPICS, type TrackerProfileInput } from "@pathway/types";
import { TRACKER_CATALOGUE, catalogueSchema } from "..";
import { trackerProfileInput } from "../../tracker.dto";
import { buildTrackerChecklist } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";
import { slovakiaRegionCodes } from ".";
import { catalogueV128 } from "../v1.28";

function checklist(changes: Partial<TrackerProfileInput>, region = "SK010") {
  const now = new Date(`${TRACKER_CATALOGUE.releasedAt}T12:00:00Z`);
  return buildTrackerChecklist({
    catalogue: TRACKER_CATALOGUE,
    profile: {
      version: 1,
      updatedAt: now.toISOString(),
      profile: trackerProfileInput.parse({ ...testProfile, ...changes }),
    },
    location: {
      countryCode: "SK",
      subdivisionCode: region,
      jurisdictionCodes: region ? [region, "SK"] : ["SK"],
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

describe("Slovakia partial national and kraj release", () => {
  it("uses actual registered-school status rather than ACE, funding or screen selection", () => {
    expect(
      applicability("sk.school-register", {
        providerCategory: "INDEPENDENT_SCHOOL",
        fundingStatus: "PUBLIC",
        ace: true,
      }),
    ).toBe("APPLICABLE");
    expect(
      applicability("sk.school-register", {
        sector: "LEARNING_CENTRE",
        vertical: "PUBLIC_LEARNING_CENTRE",
        providerCategory: "OUT_OF_SCHOOL",
        fundingStatus: "PRIVATE",
        ace: false,
      }),
    ).toBe("NOT_APPLICABLE");
    expect(
      applicability("sk.under-three-care-route", {
        providerCategory: "CHILDCARE",
        minimumAge: 1,
      }),
    ).toBe("APPLICABLE");
  });

  it("limits pedagogical checks and ICCE terms to their actual provision", () => {
    expect(
      applicability("sk.pedagogical-staff-integrity", {
        providerCategory: "OUT_OF_SCHOOL",
      }),
    ).toBe("NOT_APPLICABLE");
    expect(applicability("sk.icce-provider", { icce: true })).toBe(
      "APPLICABLE",
    );
    expect(applicability("sk.icce-provider", { ace: true, icce: false })).toBe(
      "NOT_APPLICABLE",
    );
  });

  it("keeps all local and incomplete topics visible", () => {
    expect(catalogueSchema.safeParse(TRACKER_CATALOGUE).success).toBe(true);
    expect(slovakiaRegionCodes).toHaveLength(8);
    const cells = TRACKER_CATALOGUE.coverage.filter((cell) =>
      ["SK", ...slovakiaRegionCodes].includes(cell.jurisdiction),
    );
    expect(cells).toHaveLength(9 * 6 * TRACKER_TOPICS.length);
    expect(
      cells
        .filter((cell) => cell.jurisdiction === "SK")
        .every((cell) => cell.status === "PARTIALLY_PUBLISHED"),
    ).toBe(true);
    expect(
      cells
        .filter((cell) => cell.jurisdiction !== "SK")
        .every((cell) =>
          ["PARTIALLY_PUBLISHED", "IN_REVIEW"].includes(cell.status),
        ),
    ).toBe(true);
    expect(TRACKER_CATALOGUE.requirements).toEqual(
      expect.arrayContaining(catalogueV128.requirements),
    );
    expect(TRACKER_CATALOGUE.version).toBe("1.33.0");
  });

  it("does not select a regional action without a confirmed region", () => {
    const result = checklist({ providerCategory: "INDEPENDENT_SCHOOL" }, "");
    expect(
      result.items.some((item) =>
        item.requirement.id.startsWith("sk.regional-school-route-"),
      ),
    ).toBe(false);
    expect(
      result.coverage.find((cell) => cell.jurisdiction === "SK")
        ?.regionalStatus,
    ).toBe("UNAVAILABLE");
  });
});
