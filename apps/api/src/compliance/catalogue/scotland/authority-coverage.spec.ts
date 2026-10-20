import { TRACKER_TOPICS } from "@pathway/types";
import { TRACKER_CATALOGUE } from "..";
import { buildTrackerChecklist } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";
import { scotlandCouncilAreas } from "./authorities";

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
      subdivisionCode: "GB-SCT",
      jurisdictionCodes,
    },
    attestations: [],
    evidenceCounts: {},
    now,
  });
}

describe("Scotland council-area inventory", () => {
  it("shows the selected council and Scotland national core without claiming local duties are reviewed", () => {
    const council = scotlandCouncilAreas.find(
      ({ name }) => name === "City of Edinburgh",
    );
    if (!council) throw new Error("City of Edinburgh is absent from ONS data");
    const result = checklist([council.code, "GB-SCT", "GB"]);
    const councilCells = result.coverage.filter(
      (cell) => cell.jurisdiction === council.code,
    );
    expect(councilCells).toHaveLength(TRACKER_TOPICS.length);
    expect(councilCells.every((cell) => cell.status === "IN_REVIEW")).toBe(
      true,
    );
    expect(
      result.coverage.filter((cell) => cell.jurisdiction === "GB-SCT"),
    ).toHaveLength(TRACKER_TOPICS.length);
    expect(
      result.coverage
        .filter((cell) => cell.jurisdiction === "GB-SCT")
        .every((cell) => cell.regionalStatus === "IN_REVIEW"),
    ).toBe(true);
    expect(
      result.items.some((item) => item.requirement.id.startsWith("sct.")),
    ).toBe(true);
  });

  it("keeps regional scope unresolved without a council", () => {
    const result = checklist(["GB-SCT", "GB"]);
    expect(result.coverage).toHaveLength(TRACKER_TOPICS.length);
    expect(
      result.coverage.every((cell) => cell.regionalStatus === "UNAVAILABLE"),
    ).toBe(true);
    expect(scotlandCouncilAreas).toHaveLength(32);
    expect(
      scotlandCouncilAreas.filter(({ name }) => name === "North Ayrshire"),
    ).toHaveLength(1);
  });
});
