import { TRACKER_TOPICS, type TrackerProfileInput } from "@pathway/types";
import { TRACKER_CATALOGUE, catalogueSchema } from "..";
import { trackerProfileInput } from "../../tracker.dto";
import { buildTrackerChecklist } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";
import { spainRegionCodes } from ".";
import { catalogueV130 } from "../v1.30";

function checklist(changes: Partial<TrackerProfileInput>, region = "ES30") {
  const now = new Date(`${TRACKER_CATALOGUE.releasedAt}T12:00:00Z`);
  return buildTrackerChecklist({
    catalogue: TRACKER_CATALOGUE,
    profile: {
      version: 1,
      updatedAt: now.toISOString(),
      profile: trackerProfileInput.parse({ ...testProfile, ...changes }),
    },
    location: {
      countryCode: "ES",
      subdivisionCode: region,
      jurisdictionCodes: region ? [region, "ES"] : ["ES"],
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

describe("Spain partial national and autonomous-community release", () => {
  it("uses actual school or childcare status, not ACE, funding or screen choice", () => {
    expect(
      applicability("es.school-authorisation", {
        providerCategory: "INDEPENDENT_SCHOOL",
        fundingStatus: "PRIVATE",
        ace: true,
      }),
    ).toBe("APPLICABLE");
    expect(
      applicability("es.school-authorisation", {
        sector: "LEARNING_CENTRE",
        vertical: "PUBLIC_LEARNING_CENTRE",
        providerCategory: "OUT_OF_SCHOOL",
        fundingStatus: "PRIVATE",
        ace: false,
      }),
    ).toBe("NOT_APPLICABLE");
    expect(
      applicability("es.childcare-route", {
        providerCategory: "CHILDCARE",
        minimumAge: 1,
      }),
    ).toBe("APPLICABLE");
  });

  it("keeps staff role decisions and ICCE participation separate", () => {
    expect(applicability("es.child-facing-integrity", { minimumAge: 18 })).toBe(
      "NOT_APPLICABLE",
    );
    expect(applicability("es.icce-provider", { icce: true })).toBe(
      "APPLICABLE",
    );
    expect(applicability("es.icce-provider", { ace: true, icce: false })).toBe(
      "NOT_APPLICABLE",
    );
  });

  it("publishes a partial national core and leaves substantive regional rules in review", () => {
    expect(catalogueSchema.safeParse(TRACKER_CATALOGUE).success).toBe(true);
    expect(spainRegionCodes).toHaveLength(19);
    const cells = TRACKER_CATALOGUE.coverage.filter((cell) =>
      ["ES", ...spainRegionCodes].includes(cell.jurisdiction),
    );
    expect(cells).toHaveLength(20 * 6 * TRACKER_TOPICS.length);
    expect(
      cells
        .filter((cell) => cell.jurisdiction === "ES")
        .every((cell) => cell.status === "PARTIALLY_PUBLISHED"),
    ).toBe(true);
    expect(
      cells
        .filter(
          (cell) =>
            cell.jurisdiction !== "ES" &&
            cell.topic !== "registration_governance",
        )
        .every((cell) => cell.status === "IN_REVIEW"),
    ).toBe(true);
    expect(TRACKER_CATALOGUE.requirements).toEqual(
      expect.arrayContaining(catalogueV130.requirements),
    );
    expect(TRACKER_CATALOGUE.version).toBe("1.34.0");
  });

  it("does not select a regional action when location is unresolved", () => {
    const result = checklist({ providerCategory: "INDEPENDENT_SCHOOL" }, "");
    expect(
      result.items.some((item) =>
        item.requirement.id.startsWith("es.regional-authority-"),
      ),
    ).toBe(false);
    expect(
      result.coverage.find((cell) => cell.jurisdiction === "ES")
        ?.regionalStatus,
    ).toBe("UNAVAILABLE");
  });
});
