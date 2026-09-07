import {
  configuratorStepVariants,
  reducedStepVariants,
  visibleFirstContainerVariants,
} from "../lib/motion";

describe("motion progressive enhancement", () => {
  it("keeps content visible before animation starts", () => {
    expect(visibleFirstContainerVariants.hidden).toMatchObject({ opacity: 1 });
    expect(visibleFirstContainerVariants.visible).toMatchObject({ opacity: 1 });
  });

  it("keeps the initial configurator step readable before hydration", () => {
    expect(configuratorStepVariants.initial("forward")).toMatchObject({
      opacity: 1,
    });
    expect(reducedStepVariants.initial).toMatchObject({ opacity: 1 });
  });
});
