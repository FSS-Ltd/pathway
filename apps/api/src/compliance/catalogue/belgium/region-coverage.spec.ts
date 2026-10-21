import { TRACKER_TOPICS } from "@pathway/types";
import { TRACKER_CATALOGUE } from "..";
import { buildTrackerChecklist } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";
import { belgiumRegions } from "./regions";

const now = new Date(`${TRACKER_CATALOGUE.releasedAt}T12:00:00Z`);

function checklist(jurisdictionCodes: string[]) {
  return buildTrackerChecklist({
    catalogue: TRACKER_CATALOGUE,
    profile: {
      version: 1,
      updatedAt: now.toISOString(),
      profile: { ...testProfile, region: null, localAuthority: null },
    },
    location: { countryCode: "BE", subdivisionCode: null, jurisdictionCodes },
    attestations: [],
    evidenceCounts: {},
    now,
  });
}

describe("Belgium Region inventory", () => {
  it("keeps Brussels and Community duties separate from national actions", () => {
    const result = checklist(["BE1", "BE"]);
    const regionCells = result.coverage.filter(
      (cell) => cell.jurisdiction === "BE1",
    );
    expect(regionCells).toHaveLength(TRACKER_TOPICS.length);
    expect(regionCells.every((cell) => cell.status === "IN_REVIEW")).toBe(true);
    expect(
      result.coverage.filter((cell) => cell.jurisdiction === "BE"),
    ).toHaveLength(TRACKER_TOPICS.length);
    expect(
      result.items.some((item) => item.requirement.id.startsWith("bel.")),
    ).toBe(true);
    expect(result.coverageGaps).toBe(TRACKER_TOPICS.length * 2);
    expect(
      result.coverage.find(
        (cell) =>
          cell.jurisdiction === "BE" && cell.topic === "education_childcare",
      )?.reason,
    ).toContain(
      "education Community responsible for this provision is not recorded",
    );
  });

  it("does not infer a Region or Community from the country", () => {
    const result = checklist(["BE"]);
    expect(result.coverage).toHaveLength(TRACKER_TOPICS.length);
    expect(
      result.coverage.every((cell) => cell.regionalStatus === "UNAVAILABLE"),
    ).toBe(true);
    expect(belgiumRegions.map(({ code }) => code)).toEqual([
      "BE1",
      "BE2",
      "BE3",
    ]);
  });
});
