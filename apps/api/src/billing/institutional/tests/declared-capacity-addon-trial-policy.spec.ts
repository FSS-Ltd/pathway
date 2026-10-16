import {
  addonTrialExpiresAt,
  declaredCapacityTrialSlots,
} from "../declared-capacity-addon-trial-policy";

describe("declared-capacity add-on trial policy", () => {
  it.each([
    [0, 2],
    [74, 2],
    [75, 3],
    [149, 3],
    [150, 4],
    [250, 4],
  ])(
    "allows the tier's lifetime trial slots at %i children",
    (capacity, slots) => {
      expect(declaredCapacityTrialSlots(capacity)).toBe(slots);
    },
  );

  it("requires enterprise capacity to use the custom sales path", () => {
    expect(() => declaredCapacityTrialSlots(251)).toThrow(
      "DECLARED_CAPACITY_ENTERPRISE_TRIALS_UNAVAILABLE",
    );
  });

  it("sets an exact 60 by 24 hour expiry from activation", () => {
    const activatedAt = new Date("2030-01-01T12:34:56.789Z");
    expect(addonTrialExpiresAt(activatedAt)).toEqual(
      new Date("2030-03-02T12:34:56.789Z"),
    );
  });
});
