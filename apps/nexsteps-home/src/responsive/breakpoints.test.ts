import { breakpoints, isTabletWidth } from "./breakpoints";

describe("isTabletWidth", () => {
  it("treats the phone/tablet boundary as tablet", () => {
    expect(isTabletWidth(breakpoints.tablet)).toBe(true);
  });

  it("treats widths below the boundary as phone", () => {
    expect(isTabletWidth(breakpoints.tablet - 1)).toBe(false);
  });

  it("treats the iPhone wireframe width (393) as phone", () => {
    expect(isTabletWidth(393)).toBe(false);
  });
});
