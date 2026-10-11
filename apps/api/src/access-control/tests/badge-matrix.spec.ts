import { badgeCoverage } from "../badge-matrix";

describe("badgeCoverage", () => {
  it("requires every mapped permission for full role coverage", () => {
    expect(
      badgeCoverage(["ace.pace.read", "ace.pace.record"], ["ace.pace.read"]),
    ).toBe("partial");
    expect(
      badgeCoverage(
        ["ace.pace.read", "ace.pace.record"],
        ["ace.pace.read", "ace.pace.record"],
      ),
    ).toBe("full");
  });

  it("never treats an empty badge mapping as inherited", () => {
    expect(badgeCoverage([], ["ace.pace.read"])).toBe("none");
  });
});
