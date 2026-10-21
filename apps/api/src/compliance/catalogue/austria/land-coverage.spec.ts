import { TRACKER_TOPICS } from "@pathway/types";
import { TRACKER_CATALOGUE } from "..";
import { buildTrackerChecklist } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";
import { austriaLands } from "./lands";

const now = new Date(`${TRACKER_CATALOGUE.releasedAt}T12:00:00Z`);

function checklist(jurisdictionCodes: string[]) {
  return buildTrackerChecklist({
    catalogue: TRACKER_CATALOGUE,
    profile: {
      version: 1,
      updatedAt: now.toISOString(),
      profile: { ...testProfile, region: null, localAuthority: null },
    },
    location: { countryCode: "AT", subdivisionCode: null, jurisdictionCodes },
    attestations: [],
    evidenceCounts: {},
    now,
  });
}

describe("Austria Land inventory", () => {
  it("shows Wien and national actions with separate regional gaps", () => {
    const result = checklist(["AT-9", "AT"]);
    const landCells = result.coverage.filter(
      (cell) => cell.jurisdiction === "AT-9",
    );
    expect(landCells).toHaveLength(TRACKER_TOPICS.length);
    expect(landCells.every((cell) => cell.status === "IN_REVIEW")).toBe(true);
    expect(
      result.coverage.filter((cell) => cell.jurisdiction === "AT"),
    ).toHaveLength(TRACKER_TOPICS.length);
    expect(
      result.items.some((item) => item.requirement.id.startsWith("aut.")),
    ).toBe(true);
  });

  it("keeps Land scope unresolved without a selected Bundesland", () => {
    const result = checklist(["AT"]);
    expect(result.coverage).toHaveLength(TRACKER_TOPICS.length);
    expect(
      result.coverage.every((cell) => cell.regionalStatus === "UNAVAILABLE"),
    ).toBe(true);
    expect(austriaLands).toHaveLength(9);
  });
});
