import {
  admitChild,
  isEnrolledOn,
  leaveChild,
  validatePeriods,
} from "../enrolment-periods";

describe("continuing enrolment periods", () => {
  it("counts admission days and excludes leaving days, including holidays", () => {
    const admitted = admitChild([], "2026-09-01");
    expect(isEnrolledOn(admitted, "2026-12-25")).toBe(true);
    const left = leaveChild(admitted, "2027-01-15");
    expect(isEnrolledOn(left, "2027-01-14")).toBe(true);
    expect(isEnrolledOn(left, "2027-01-15")).toBe(false);
    const reenrolled = admitChild(left, "2027-03-01");
    expect(isEnrolledOn(reenrolled, "2027-02-01")).toBe(false);
    expect(isEnrolledOn(reenrolled, "2027-03-01")).toBe(true);
  });

  it("rejects duplicate admissions, invalid dates, and overlapping corrections", () => {
    const admitted = admitChild([], "2026-09-01");
    expect(() => admitChild(admitted, "2026-10-01")).toThrow();
    expect(() => leaveChild(admitted, "2026-09-01")).toThrow();
    expect(() => admitChild([], "2026-02-30")).toThrow();
    expect(() =>
      validatePeriods([
        { admittedOn: "2026-01-01", leftOn: "2026-05-01" },
        { admittedOn: "2026-04-30", leftOn: null },
      ]),
    ).toThrow();
  });
});
