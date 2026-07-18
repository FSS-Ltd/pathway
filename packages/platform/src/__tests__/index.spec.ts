import * as platform from "../index";

describe("@pathway/platform barrel exports", () => {
  it("exports the four resolver functions", () => {
    expect(typeof platform.getOrgVertical).toBe("function");
    expect(typeof platform.orgHasModule).toBe("function");
    expect(typeof platform.getOrgCapabilities).toBe("function");
    expect(typeof platform.orgHasCapability).toBe("function");
  });
});
