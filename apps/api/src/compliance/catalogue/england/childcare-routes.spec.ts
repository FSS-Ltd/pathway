import { TRACKER_CATALOGUE } from "..";
import { buildTrackerChecklist } from "../../tracker-engine";
import { trackerProfileInput } from "../../tracker.dto";
import { testProfile } from "../../tests/tracker-fixture";
import type { TrackerProfileInput } from "@pathway/types";

function actions(facts: Partial<TrackerProfileInput>) {
  return buildTrackerChecklist({
    catalogue: TRACKER_CATALOGUE,
    profile: {
      version: 1,
      updatedAt: "2026-10-18T12:00:00Z",
      profile: trackerProfileInput.parse({ ...testProfile, ...facts }),
    },
    location: { countryCode: "GB", subdivisionCode: "GB-ENG" },
    attestations: [],
    evidenceCounts: {},
    now: new Date("2026-10-19T12:00:00Z"),
  }).items;
}

describe("England childcare route assessments", () => {
  it("keeps register-specific duties separate from EYFS and funding status", () => {
    const result = actions({
      childcare: true,
      eyfsApplies: false,
      fundingStatus: "PRIVATE",
    });
    expect(
      result.find(
        (item) => item.requirement.id === "eng.childcare-register-conditions",
      )?.applicability,
    ).toBe("APPLICABLE");
    expect(
      result.find(
        (item) => item.requirement.id === "eng.funded-early-years-agreement",
      )?.applicability,
    ).toBe("APPLICABLE");
    expect(
      result.find(
        (item) => item.requirement.id === "eng.childcare-register-conditions",
      )?.requirement.obligationClass,
    ).toBe("RECOMMENDATION");
  });
  it("retains funded-place assessment for EYFS education even without a childcare answer", () => {
    expect(
      actions({ childcare: false, eyfsApplies: true }).find(
        (item) => item.requirement.id === "eng.funded-early-years-agreement",
      )?.applicability,
    ).toBe("APPLICABLE");
  });
  it("does not silently exclude an unresolved childcare assessment", () => {
    expect(
      actions({ childcare: null }).find(
        (item) => item.requirement.id === "eng.childcare-register-conditions",
      )?.applicability,
    ).toBe("UNRESOLVED");
  });
  it("does not impose childcare-specific rows when provision is explicitly absent", () => {
    expect(
      actions({ childcare: false }).find(
        (item) => item.requirement.id === "eng.childcare-register-conditions",
      )?.applicability,
    ).toBe("NOT_APPLICABLE");
  });
});
