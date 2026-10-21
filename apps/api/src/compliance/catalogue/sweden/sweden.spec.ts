import { TRACKER_TOPICS, type TrackerProfileInput } from "@pathway/types";
import { TRACKER_CATALOGUE, catalogueSchema } from "..";
import { trackerProfileInput } from "../../tracker.dto";
import { buildTrackerChecklist } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";
import { swedenCountyCodes } from ".";
import { catalogueV131 } from "../v1.31";

function checklist(changes: Partial<TrackerProfileInput>, county = "SE110") {
  const now = new Date(`${TRACKER_CATALOGUE.releasedAt}T12:00:00Z`);
  return buildTrackerChecklist({
    catalogue: TRACKER_CATALOGUE,
    profile: {
      version: 1,
      updatedAt: now.toISOString(),
      profile: trackerProfileInput.parse({ ...testProfile, ...changes }),
    },
    location: {
      countryCode: "SE",
      subdivisionCode: county,
      jurisdictionCodes: county ? [county, "SE"] : ["SE"],
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

describe("Sweden partial national and county release", () => {
  it("uses actual provider status instead of ACE, funding or school-style screens", () => {
    expect(
      applicability("se.independent-school-approval", {
        providerCategory: "INDEPENDENT_SCHOOL",
        fundingStatus: "PRIVATE",
        ace: true,
      }),
    ).toBe("APPLICABLE");
    expect(
      applicability("se.independent-school-approval", {
        sector: "LEARNING_CENTRE",
        vertical: "PUBLIC_LEARNING_CENTRE",
        providerCategory: "OUT_OF_SCHOOL",
        fundingStatus: "PRIVATE",
        ace: false,
      }),
    ).toBe("NOT_APPLICABLE");
    expect(
      applicability("se.early-years-approval", {
        providerCategory: "CHILDCARE",
        minimumAge: 2,
      }),
    ).toBe("APPLICABLE");
  });

  it("separates mandatory education reporting and checks from non-school guidance", () => {
    expect(
      applicability("se.covered-child-reporting", {
        providerCategory: "INDEPENDENT_SCHOOL",
        minimumAge: 6,
      }),
    ).toBe("APPLICABLE");
    expect(
      applicability("se.covered-child-reporting", {
        providerCategory: "OUT_OF_SCHOOL",
        minimumAge: 6,
      }),
    ).toBe("NOT_APPLICABLE");
    expect(
      applicability("se.other-child-reporting", {
        providerCategory: "OUT_OF_SCHOOL",
        minimumAge: 6,
      }),
    ).toBe("APPLICABLE");
    expect(
      applicability("se.education-register-check", {
        providerCategory: "OUT_OF_SCHOOL",
        minimumAge: 6,
      }),
    ).toBe("NOT_APPLICABLE");
    expect(applicability("se.other-child-roles", { minimumAge: 18 })).toBe(
      "NOT_APPLICABLE",
    );
    const reporting = TRACKER_CATALOGUE.requirements.find(
      (item) => item.id === "se.other-child-reporting",
    );
    expect(reporting?.applicabilityExplanation).toContain(
      "professionally run private services",
    );
    expect(
      TRACKER_CATALOGUE.requirements.find(
        (item) => item.id === "se.covered-child-reporting",
      )?.allowsNotApplicable,
    ).toBe(true);
  });

  it("limits ICCE terms to actual participation and keeps county gaps visible", () => {
    expect(applicability("se.icce-provider", { icce: true })).toBe(
      "APPLICABLE",
    );
    expect(applicability("se.icce-provider", { ace: true, icce: false })).toBe(
      "NOT_APPLICABLE",
    );
    expect(catalogueSchema.safeParse(TRACKER_CATALOGUE).success).toBe(true);
    expect(swedenCountyCodes).toHaveLength(21);
    const cells = TRACKER_CATALOGUE.coverage.filter((cell) =>
      ["SE", ...swedenCountyCodes].includes(cell.jurisdiction),
    );
    expect(cells).toHaveLength(22 * 6 * TRACKER_TOPICS.length);
    expect(
      cells
        .filter((cell) => cell.jurisdiction === "SE")
        .every((cell) => cell.status === "PARTIALLY_PUBLISHED"),
    ).toBe(true);
    expect(
      cells
        .filter(
          (cell) =>
            cell.jurisdiction !== "SE" &&
            cell.topic !== "registration_governance",
        )
        .every((cell) => cell.status === "IN_REVIEW"),
    ).toBe(true);
    expect(TRACKER_CATALOGUE.requirements).toEqual(
      expect.arrayContaining(catalogueV131.requirements),
    );
    expect(TRACKER_CATALOGUE.version).toBe("1.37.0");
  });

  it("does not silently select Stockholm county when the site has no county", () => {
    const result = checklist({ providerCategory: "INDEPENDENT_SCHOOL" }, "");
    expect(
      result.items.some((item) =>
        item.requirement.id.startsWith("se.local-authority-"),
      ),
    ).toBe(false);
    expect(
      result.coverage.find((cell) => cell.jurisdiction === "SE")
        ?.regionalStatus,
    ).toBe("UNAVAILABLE");
  });
});
