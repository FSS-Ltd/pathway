import { TRACKER_TOPICS } from "@pathway/types";
import { TRACKER_CATALOGUE } from "..";
import { buildTrackerChecklist } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";
import { northernIrelandDistricts } from "./districts";

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
      subdivisionCode: "GB-NIR",
      jurisdictionCodes,
    },
    attestations: [],
    evidenceCounts: {},
    now,
  });
}

describe("Northern Ireland district inventory", () => {
  it("shows Belfast and the national core without claiming local duties are reviewed", () => {
    const belfast = northernIrelandDistricts.find(
      ({ name }) => name === "Belfast",
    );
    if (!belfast) throw new Error("Belfast is absent from ONS data");
    const result = checklist([belfast.code, "GB-NIR", "GB"]);
    const districtCells = result.coverage.filter(
      (cell) => cell.jurisdiction === belfast.code,
    );
    expect(districtCells).toHaveLength(TRACKER_TOPICS.length);
    expect(districtCells.every((cell) => cell.status === "IN_REVIEW")).toBe(
      true,
    );
    expect(
      result.coverage.filter((cell) => cell.jurisdiction === "GB-NIR"),
    ).toHaveLength(TRACKER_TOPICS.length);
    expect(
      result.coverage
        .filter((cell) => cell.jurisdiction === "GB-NIR")
        .every((cell) => cell.regionalStatus === "IN_REVIEW"),
    ).toBe(true);
    expect(
      result.items.some((item) => item.requirement.id.startsWith("nir.")),
    ).toBe(true);
  });

  it("keeps local scope unresolved without a district", () => {
    const result = checklist(["GB-NIR", "GB"]);
    expect(result.coverage).toHaveLength(TRACKER_TOPICS.length);
    expect(
      result.coverage.every((cell) => cell.regionalStatus === "UNAVAILABLE"),
    ).toBe(true);
    expect(northernIrelandDistricts).toHaveLength(11);
  });
});
