import { TRACKER_TOPICS, type TrackerProfileInput } from "@pathway/types";
import { TRACKER_CATALOGUE, catalogueSchema } from "..";
import { trackerProfileInput } from "../../tracker.dto";
import { buildTrackerChecklist } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";
import { romaniaCountyCodes } from ".";
import { catalogueV127 } from "../v1.27";

function checklist(
  changes: Partial<TrackerProfileInput>,
  countyCode = "RO321",
) {
  const now = new Date(`${TRACKER_CATALOGUE.releasedAt}T12:00:00Z`);
  return buildTrackerChecklist({
    catalogue: TRACKER_CATALOGUE,
    profile: {
      version: 1,
      updatedAt: now.toISOString(),
      profile: trackerProfileInput.parse({ ...testProfile, ...changes }),
    },
    location: {
      countryCode: "RO",
      subdivisionCode: countyCode,
      jurisdictionCodes: countyCode ? [countyCode, "RO"] : ["RO"],
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

describe("Romania partial national and county release", () => {
  it("separates actual school status from ACE, funding and learning-centre screens", () => {
    expect(
      applicability("ro.school-authorisation", {
        providerCategory: "INDEPENDENT_SCHOOL",
        fundingStatus: "PUBLIC",
        ace: true,
      }),
    ).toBe("APPLICABLE");
    expect(
      applicability("ro.school-authorisation", {
        sector: "LEARNING_CENTRE",
        vertical: "PUBLIC_LEARNING_CENTRE",
        providerCategory: "OUT_OF_SCHOOL",
        fundingStatus: "PRIVATE",
        ace: false,
      }),
    ).toBe("NOT_APPLICABLE");
    expect(
      applicability("ro.early-childhood-route", {
        providerCategory: "CHILDCARE",
        minimumAge: 1,
        childcare: true,
      }),
    ).toBe("APPLICABLE");
    expect(
      applicability("ro.early-childhood-operation", {
        providerCategory: "OUT_OF_SCHOOL",
        minimumAge: 8,
        childcare: true,
      }),
    ).toBe("NOT_APPLICABLE");
  });

  it("keeps child-facing checks and ICCE conditional on actual provision", () => {
    expect(applicability("ro.behavioural-integrity-check", {})).toBe(
      "APPLICABLE",
    );
    expect(
      applicability("ro.behavioural-integrity-check", {
        minimumAge: 18,
        maximumAge: 25,
      }),
    ).toBe("NOT_APPLICABLE");
    expect(applicability("ro.icce-provider", { icce: true })).toBe(
      "APPLICABLE",
    );
    expect(applicability("ro.icce-provider", { ace: true, icce: false })).toBe(
      "NOT_APPLICABLE",
    );
  });

  it("publishes partial coverage for every sector and topic and keeps municipal gaps visible", () => {
    expect(catalogueSchema.safeParse(TRACKER_CATALOGUE).success).toBe(true);
    expect(romaniaCountyCodes).toHaveLength(42);
    const cells = TRACKER_CATALOGUE.coverage.filter((cell) =>
      ["RO", ...romaniaCountyCodes].includes(cell.jurisdiction),
    );
    expect(cells).toHaveLength(43 * 6 * TRACKER_TOPICS.length);
    expect(
      cells
        .filter((cell) => cell.jurisdiction === "RO")
        .every((cell) => cell.status === "PARTIALLY_PUBLISHED"),
    ).toBe(true);
    expect(
      cells
        .filter((cell) => cell.jurisdiction !== "RO")
        .every((cell) =>
          ["PARTIALLY_PUBLISHED", "IN_REVIEW"].includes(cell.status),
        ),
    ).toBe(true);
    expect(TRACKER_CATALOGUE.requirements).toEqual(
      expect.arrayContaining(catalogueV127.requirements),
    );
    expect(TRACKER_CATALOGUE.version).toBe("1.34.0");
  });

  it("does not select a county action without a confirmed county", () => {
    const result = checklist({ providerCategory: "INDEPENDENT_SCHOOL" }, "");
    expect(
      result.items.some((item) =>
        item.requirement.id.startsWith("ro.county-school-route-"),
      ),
    ).toBe(false);
    expect(
      result.coverage.find((cell) => cell.jurisdiction === "RO")
        ?.regionalStatus,
    ).toBe("UNAVAILABLE");
  });
});
