import { TRACKER_TOPICS } from "@pathway/types";
import { TRACKER_CATALOGUE } from "..";
import { buildTrackerChecklist } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";
import { irelandLocalAuthorities } from "./local-authorities";

const now = new Date(`${TRACKER_CATALOGUE.releasedAt}T12:00:00Z`);

function checklist(jurisdictionCodes: string[]) {
  return buildTrackerChecklist({
    catalogue: TRACKER_CATALOGUE,
    profile: {
      version: 1,
      updatedAt: now.toISOString(),
      profile: { ...testProfile, region: null, localAuthority: null },
    },
    location: { countryCode: "IE", subdivisionCode: null, jurisdictionCodes },
    attestations: [],
    evidenceCounts: {},
    now,
  });
}

describe("Ireland local-authority inventory", () => {
  it("shows Dublin City and national actions with distinct local gaps", () => {
    const dublin = irelandLocalAuthorities.find(
      ({ name }) => name === "Dublin City Council",
    );
    if (!dublin) throw new Error("Dublin City is absent from Tailte data");
    const result = checklist([dublin.code, "IE"]);
    const localCells = result.coverage.filter(
      (cell) => cell.jurisdiction === dublin.code,
    );
    expect(localCells).toHaveLength(TRACKER_TOPICS.length);
    expect(localCells.every((cell) => cell.status === "IN_REVIEW")).toBe(true);
    expect(
      result.coverage.filter((cell) => cell.jurisdiction === "IE"),
    ).toHaveLength(TRACKER_TOPICS.length);
    expect(
      result.items.some((item) => item.requirement.id.startsWith("irl.")),
    ).toBe(true);
  });

  it("keeps local scope unresolved without an authority", () => {
    const result = checklist(["IE"]);
    expect(result.coverage).toHaveLength(TRACKER_TOPICS.length);
    expect(
      result.coverage.every((cell) => cell.regionalStatus === "UNAVAILABLE"),
    ).toBe(true);
    expect(irelandLocalAuthorities).toHaveLength(31);
  });
});
