import { formatRunningTotal } from "../components/configurator/running-total-copy";

describe("running total copy", () => {
  it("does not present an unselected configuration as a free plan", () => {
    expect(formatRunningTotal(null, "monthly")).toEqual({
      label: "Select a plan to see your total",
      amount: null,
    });
  });

  it("formats a selected total with its billing period", () => {
    expect(formatRunningTotal(49, "monthly")).toEqual({
      label: "Total per month",
      amount: 49,
    });
  });
});
