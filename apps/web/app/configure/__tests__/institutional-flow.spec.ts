import {
  enrolledCount,
  INITIAL_CONFIGURATION,
  nextStep,
  previousStep,
  stepsFor,
} from "../institutional-flow";

describe("institutional configurator navigation", () => {
  it.each(["CHURCH", "CHARITY", "CLUB", "NURSERY"] as const)(
    "keeps %s in the journey without a school-only setting step",
    (orgType) => {
      const steps = stepsFor(orgType);
      expect(steps).toEqual([
        "plan",
        "organisation",
        "pupils",
        "included",
        "modules",
        "storage",
        "summary",
      ]);
      expect(
        nextStep({ ...INITIAL_CONFIGURATION, orgType, step: "organisation" }),
      ).toBe("pupils");
      expect(
        previousStep({ ...INITIAL_CONFIGURATION, orgType, step: "pupils" }),
      ).toBe("organisation");
    },
  );

  it("asks schools for their setting before the pupil count", () => {
    expect(stepsFor("SCHOOL")).toContain("setting");
    expect(
      nextStep({
        ...INITIAL_CONFIGURATION,
        orgType: "SCHOOL",
        step: "organisation",
      }),
    ).toBe("setting");
  });

  it.each(["", "-1", "1.5", "NaN", "9007199254740992"])(
    "rejects an invalid declared count: %s",
    (input) => expect(enrolledCount(input)).toBeNull(),
  );

  it.each(["0", "26", "100", "101", "250", "251"])(
    "preserves valid count %s for server-side pricing",
    (input) => expect(enrolledCount(input)).toBe(Number(input)),
  );
});
