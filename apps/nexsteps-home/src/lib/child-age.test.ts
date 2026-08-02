import { ageToDateOfBirth } from "./child-age";

describe("ageToDateOfBirth", () => {
  it("subtracts age from the reference year", () => {
    expect(ageToDateOfBirth(9, new Date("2026-08-02"))).toBe("2017-01-01");
  });

  it("handles age 0", () => {
    expect(ageToDateOfBirth(0, new Date("2026-08-02"))).toBe("2026-01-01");
  });
});
