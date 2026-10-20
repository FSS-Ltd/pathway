import { TRACKER_TOPICS, type TrackerProfileInput } from "@pathway/types";
import { TRACKER_CATALOGUE, catalogueSchema } from "..";
import { catalogueV126 } from "../v1.26";
import { trackerProfileInput } from "../../tracker.dto";
import { buildTrackerChecklist } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";
import { mainlandDistrictCodes, portugalRegionCodes } from "./index";

function checklist(
  changes: Partial<TrackerProfileInput>,
  regionCode = "PT-D11",
  municipalityCode = "PT-CAOP-1106",
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
      countryCode: "PT",
      subdivisionCode: municipalityCode,
      jurisdictionCodes: [municipalityCode, regionCode, "PT"],
    },
    attestations: [],
    evidenceCounts: {},
    now,
  });
}

function applicability(
  id: string,
  changes: Partial<TrackerProfileInput>,
  regionCode?: string,
  municipalityCode?: string,
) {
  return checklist(changes, regionCode, municipalityCode).items.find(
    (item) => item.requirement.id === id,
  )?.applicability;
}

describe("Portugal progressive national and regional release", () => {
  it("uses actual private-school status and selected territory", () => {
    const privateSchool = {
      providerCategory: "INDEPENDENT_SCHOOL" as const,
      fundingStatus: "PUBLIC" as const,
    };
    expect(applicability("pt.mainland-private-school-11", privateSchool)).toBe(
      "APPLICABLE",
    );
    expect(
      applicability(
        "pt.mainland-private-school-11",
        privateSchool,
        "PT-AZO",
        "PT-CAOP-4201",
      ),
    ).toBeUndefined();
    expect(
      applicability(
        "pt.azores-education-authorisation",
        privateSchool,
        "PT-AZO",
        "PT-CAOP-4201",
      ),
    ).toBe("APPLICABLE");
    expect(
      applicability(
        "pt.madeira-education-authorisation",
        privateSchool,
        "PT-MAD",
        "PT-CAOP-3103",
      ),
    ).toBe("APPLICABLE");
    expect(
      applicability("pt.mainland-private-school-11", {
        providerCategory: "OUT_OF_SCHOOL",
        fundingStatus: "PRIVATE",
        sector: "LEARNING_CENTRE",
        vertical: "PUBLIC_LEARNING_CENTRE",
      }),
    ).toBe("NOT_APPLICABLE");
  });

  it("keeps social response, role checks and child transport conditional", () => {
    expect(
      applicability("pt.social-response-authorisation", {
        providerCategory: "CHILDCARE",
        childcare: true,
        minimumAge: 1,
      }),
    ).toBe("APPLICABLE");
    expect(
      applicability("pt.social-response-authorisation", {
        providerCategory: "CHILDCARE",
        childcare: true,
        minimumAge: 6,
      }),
    ).toBe("NOT_APPLICABLE");
    expect(
      applicability("pt.catl-route", {
        providerCategory: "OUT_OF_SCHOOL",
        sector: "LEARNING_CENTRE",
        vertical: "PUBLIC_LEARNING_CENTRE",
      }),
    ).toBe("APPLICABLE");
    expect(
      applicability("pt.preschool-route", {
        providerCategory: "EARLY_YEARS",
        fundingStatus: "PUBLIC",
      }),
    ).toBe("APPLICABLE");
    expect(
      applicability("pt.child-contact-criminal-record", {
        minimumAge: 18,
        maximumAge: 25,
      }),
    ).toBe("NOT_APPLICABLE");
    expect(
      applicability("pt.child-transport", {
        transport: true,
        minimumAge: 8,
      }),
    ).toBe("APPLICABLE");
    expect(
      applicability("pt.child-transport", {
        transport: true,
        minimumAge: 17,
      }),
    ).toBe("NOT_APPLICABLE");
  });

  it("marks every country and region sector/topic cell without implying full coverage", () => {
    expect(catalogueSchema.safeParse(TRACKER_CATALOGUE).success).toBe(true);
    expect(mainlandDistrictCodes).toHaveLength(18);
    expect(portugalRegionCodes).toHaveLength(20);
    const cells = TRACKER_CATALOGUE.coverage.filter((cell) =>
      ["PT", ...portugalRegionCodes].includes(cell.jurisdiction),
    );
    expect(cells).toHaveLength(21 * 6 * TRACKER_TOPICS.length);
    expect(
      cells
        .filter((cell) => cell.jurisdiction === "PT")
        .every((cell) => cell.status === "PARTIALLY_PUBLISHED"),
    ).toBe(true);
    expect(
      cells
        .filter((cell) => cell.jurisdiction !== "PT")
        .every((cell) =>
          ["PARTIALLY_PUBLISHED", "IN_REVIEW"].includes(cell.status),
        ),
    ).toBe(true);
    expect(TRACKER_CATALOGUE.version).toBe("1.27.0");
    expect(TRACKER_CATALOGUE.requirements).toEqual(
      expect.arrayContaining(catalogueV126.requirements),
    );
  });

  it("does not select a mainland regime when the operating region is missing", () => {
    const result = checklist(
      { providerCategory: "INDEPENDENT_SCHOOL", region: null },
      "",
      "",
    );
    expect(
      result.items.some((item) =>
        item.requirement.id.startsWith("pt.mainland-private-school"),
      ),
    ).toBe(false);
    expect(
      result.coverage.find((cell) => cell.jurisdiction === "PT")
        ?.regionalStatus,
    ).toBe("UNAVAILABLE");
  });
});
