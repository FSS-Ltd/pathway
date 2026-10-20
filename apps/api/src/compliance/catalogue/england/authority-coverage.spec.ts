import { TRACKER_TOPICS } from "@pathway/types";
import { TRACKER_CATALOGUE } from "..";
import { buildTrackerChecklist } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";
import {
  englandDistrictAuthorities,
  englandUpperAuthorities,
} from "./authorities";

const now = new Date(`${TRACKER_CATALOGUE.releasedAt}T12:00:00Z`);

function checklist(jurisdictionCodes: string[]) {
  return buildTrackerChecklist({
    catalogue: TRACKER_CATALOGUE,
    profile: {
      version: 1,
      updatedAt: now.toISOString(),
      profile: { ...testProfile, region: null, localAuthority: null },
    },
    location: {
      countryCode: "GB",
      subdivisionCode: "GB-ENG",
      jurisdictionCodes,
    },
    attestations: [],
    evidenceCounts: {},
    now,
  });
}

describe("England local-authority inventory", () => {
  it("keeps the national core and both council tiers visible without pretending local duties are reviewed", () => {
    const district = englandDistrictAuthorities.find(
      (authority) => authority.name === "Oxford",
    );
    if (!district) throw new Error("Oxford is absent from the ONS inventory");
    const result = checklist([
      district.code,
      district.parentCode,
      "GB-ENG",
      "GB",
    ]);
    expect(
      result.coverage.filter((cell) => cell.jurisdiction === "GB-ENG"),
    ).toHaveLength(TRACKER_TOPICS.length);
    for (const code of [district.code, district.parentCode]) {
      const cells = result.coverage.filter(
        (cell) => cell.jurisdiction === code,
      );
      expect(cells).toHaveLength(TRACKER_TOPICS.length);
      expect(cells.every((cell) => cell.status === "IN_REVIEW")).toBe(true);
    }
    expect(
      result.coverage
        .filter((cell) => cell.jurisdiction === "GB-ENG")
        .every((cell) => cell.regionalStatus === "IN_REVIEW"),
    ).toBe(true);
    expect(
      result.items.some((item) => item.requirement.id.startsWith("eng.")),
    ).toBe(true);
  });

  it("leaves regional scope unavailable when only England is known", () => {
    const result = checklist(["GB-ENG", "GB"]);
    expect(result.coverage).toHaveLength(TRACKER_TOPICS.length);
    expect(
      result.coverage.every((cell) => cell.regionalStatus === "UNAVAILABLE"),
    ).toBe(true);
    expect(englandUpperAuthorities).toHaveLength(153);
    expect(englandDistrictAuthorities).toHaveLength(164);
  });
});
