import type { TrackerProfile, TrackerProfileInput } from "@pathway/types";
import { TRACKER_CATALOGUE } from "..";
import { trackerProfileInput } from "../../tracker.dto";
import { buildTrackerChecklist } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";
const now = new Date("2026-10-18T12:00:00Z");
const location = { countryCode: "GB", subdivisionCode: "GB-ENG" };
function checklist(
  changes: Partial<TrackerProfileInput> = {},
  target = location,
) {
  const profile: TrackerProfile = {
    version: 1,
    updatedAt: now.toISOString(),
    profile: trackerProfileInput.parse({
      ...testProfile,
      schoolCategory: "INDEPENDENT",
      ...changes,
    }),
  };
  return buildTrackerChecklist({
    catalogue: TRACKER_CATALOGUE,
    profile,
    location: target,
    attestations: [],
    evidenceCounts: {},
    now,
  });
}
function applicable(changes: Partial<TrackerProfileInput> = {}) {
  return checklist(changes).items.filter(
    (item) => item.applicability === "APPLICABLE",
  );
}
describe("England national core applicability", () => {
  it("preserves England coverage and exposes incomplete national coverage", () => {
    expect(TRACKER_CATALOGUE.coverage).toHaveLength(1488);
    expect(
      TRACKER_CATALOGUE.requirements.every((item) =>
        ["GB-ENG", "GB-WLS", "GB-SCT", "GB-NIR", "IE", "AT"].includes(
          item.jurisdiction,
        ),
      ),
    ).toBe(true);
    expect(
      TRACKER_CATALOGUE.coverage.filter(
        (cell) => cell.status === "PARTIALLY_PUBLISHED",
      ),
    ).toHaveLength(288);
    expect(
      TRACKER_CATALOGUE.coverage.filter(
        (cell) => cell.status === "NOT_REVIEWED",
      ),
    ).toHaveLength(1200);
    const result = checklist();
    expect(
      result.coverage.every(
        (cell) =>
          cell.status === "PARTIALLY_PUBLISHED" && cell.reason.length > 60,
      ),
    ).toBe(true);
    expect(result.coverageGaps).toBe(8);
    expect(result.progress.completed).toBe(0);
  });
  it.each(["GB-WLS", "GB-SCT", "GB-NIR"])(
    "does not apply England by fallback in %s",
    (nation) => {
      expect(
        checklist(
          {},
          { countryCode: "GB", subdivisionCode: nation },
        ).items.filter((item) => item.requirement.id.startsWith("eng")),
      ).toEqual([]);
    },
  );
  it("does not select England for a missing nation or another country", () => {
    expect(
      checklist({}, { countryCode: "GB", subdivisionCode: "" }).items,
    ).toEqual([]);
    expect(
      checklist({}, { countryCode: "IE", subdivisionCode: "" }).items.filter(
        (item) => item.requirement.id.startsWith("eng"),
      ),
    ).toEqual([]);
    expect(
      checklist({}, { countryCode: "AT", subdivisionCode: "" }).items.filter(
        (item) => item.requirement.id.startsWith("eng"),
      ),
    ).toEqual([]);
  });
  it("combines independent-school duties and conditional ICCE requirements without automatic completion", () => {
    const both = applicable({ ace: true, icce: true });
    expect(
      both.some(
        (item) => item.requirement.id === "eng.independent-registration",
      ),
    ).toBe(true);
    expect(
      both.some((item) => item.requirement.id === "eng.icce-registration"),
    ).toBe(true);
    expect(
      both.every((item) => !item.completed && item.attestation === null),
    ).toBe(true);
    expect(
      applicable({ ace: true, icce: false }).some((item) =>
        item.requirement.id.startsWith("eng.icce-"),
      ),
    ).toBe(false);
    expect(
      checklist({ icce: null }).items.find(
        (item) => item.requirement.id === "eng.icce-registration",
      )?.applicability,
    ).toBe("UNRESOLVED");
  });
  it("does not classify a public learning centre as publicly funded or legally a school", () => {
    const result = checklist({
      sector: "LEARNING_CENTRE",
      vertical: "PUBLIC_LEARNING_CENTRE",
      providerCategory: "OUT_OF_SCHOOL",
      schoolCategory: "NOT_SCHOOL",
      fundingStatus: "PRIVATE",
      ace: false,
      icce: false,
    });
    expect(
      result.items
        .filter((item) => item.applicability === "APPLICABLE")
        .some(
          (item) =>
            item.requirement.id ===
              "eng.state-school-governance-classification" ||
            item.requirement.id === "eng.independent-registration",
        ),
    ).toBe(false);
    expect(result.profile?.profile.fundingStatus).toBe("PRIVATE");
    expect(result.coverageGaps).toBe(8);
  });
  it.each(["CHURCH", "CHARITY", "CLUB", "LEARNING_CENTRE"] as const)(
    "retains school duties when a %s operates an actual school",
    (sector) => {
      const vertical =
        sector === "LEARNING_CENTRE" ? "ACE_LEARNING_CENTRE" : sector;
      expect(
        applicable({ sector, vertical }).some(
          (item) => item.requirement.id === "eng.independent-registration",
        ),
      ).toBe(true);
    },
  );
  it("applies independent pupil first aid when an existing profile has no new subtype answer", () => {
    expect(
      applicable({
        providerCategory: "INDEPENDENT_SCHOOL",
        schoolCategory: null,
      }).some(
        (item) => item.requirement.id === "eng-independent-pupil-firstaid",
      ),
    ).toBe(true);
  });
  it("keeps new medical and controller facts unresolved until explicitly assessed", () => {
    const result = checklist();
    expect(
      result.items.find(
        (item) => item.requirement.id === "eng-school-allergy-policy",
      )?.applicability,
    ).toBe("UNRESOLVED");
    expect(
      result.items.find(
        (item) => item.requirement.id === "eng-privacy-lawful-basis",
      )?.applicability,
    ).toBe("UNRESOLVED");
    expect(
      applicable({ englandSchoolMedicalDutiesApply: true }).some(
        (item) => item.requirement.id === "eng-school-allergy-policy",
      ),
    ).toBe(true);
    expect(
      applicable({ englandSchoolMedicalDutiesApply: false }).some(
        (item) => item.requirement.id === "eng-school-allergy-policy",
      ),
    ).toBe(false);
    expect(
      applicable({ personalDataController: true }).find(
        (item) => item.requirement.id === "eng-privacy-accountability-review",
      )?.requirement.obligationClass,
    ).toBe("RECOMMENDATION");
  });
  it("withdraws current actions when review expires without claiming there are no obligations", () => {
    const result = buildTrackerChecklist({
      catalogue: TRACKER_CATALOGUE,
      profile: checklist().profile,
      location,
      attestations: [],
      evidenceCounts: {},
      now: new Date("2027-01-13T12:00:00Z"),
    });
    expect(result.items).toEqual([]);
    expect(result.progress.applicable).toBe(0);
    expect(result.coverage.every((cell) => cell.status === "STALE")).toBe(true);
    expect(result.coverageGaps).toBe(8);
  });
});
