import {
  setDeclaredCapacityAddonChoice,
  type DeclaredCapacityAddonSelection,
} from "../declared-capacity-flow";
import type { DeclaredCapacityAddonOption } from "../../../lib/institutional-estimate-client";

const finance: DeclaredCapacityAddonOption = {
  module: "FINANCE",
  trialAvailable: true,
  monthlyPricePence: 1_500,
  yearlyPricePence: 15_000,
};

describe("declared-capacity add-on choices", () => {
  const empty: DeclaredCapacityAddonSelection = {
    trialModules: [],
    payNowModules: [],
  };

  it("records a free trial choice without activating or charging it", () => {
    expect(
      setDeclaredCapacityAddonChoice(empty, finance, "trial", "month", 2),
    ).toEqual({ trialModules: ["FINANCE"], payNowModules: [] });
  });

  it("keeps a module in only one checkout category", () => {
    const trial = setDeclaredCapacityAddonChoice(
      empty,
      finance,
      "trial",
      "month",
      2,
    );
    expect(
      setDeclaredCapacityAddonChoice(trial, finance, "pay-now", "year", 2),
    ).toEqual({ trialModules: [], payNowModules: ["FINANCE"] });
  });

  it("does not exceed the tier's lifetime trial slots", () => {
    const full: DeclaredCapacityAddonSelection = {
      trialModules: ["EVENTS", "FINANCE"],
      payNowModules: [],
    };
    expect(
      setDeclaredCapacityAddonChoice(
        full,
        { ...finance, module: "HR" },
        "trial",
        "month",
        2,
      ),
    ).toBe(full);
  });
});
