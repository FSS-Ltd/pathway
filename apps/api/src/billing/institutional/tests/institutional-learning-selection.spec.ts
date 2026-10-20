import { BadRequestException } from "@nestjs/common";
import { Module } from "@pathway/db";
import {
  calculateInstitutionalQuote,
  INSTITUTIONAL_PLANS,
  INSTITUTIONAL_PRICING_VERSION,
} from "@pathway/pricing";
import { validateInstitutionalSelection } from "../institutional-selection";

describe("institutional Learning selection", () => {
  it.each(["includedModules", "paidModules"] as const)(
    "does not add core Learning as a %s item",
    (field) => {
      expect(() =>
        validateInstitutionalSelection("INSTITUTIONAL_GROWTH_MONTHLY", {
          includedModules: field === "includedModules" ? [Module.LEARNING] : [],
          paidModules: field === "paidModules" ? [Module.LEARNING] : [],
        }),
      ).toThrow(BadRequestException);
    },
  );

  it("prices the base plan without a second Learning line or module slot", () => {
    const selection = validateInstitutionalSelection(
      "INSTITUTIONAL_GROWTH_MONTHLY",
      { includedModules: [], paidModules: [] },
    );
    const plan = INSTITUTIONAL_PLANS.INSTITUTIONAL_GROWTH_MONTHLY;
    const quote = calculateInstitutionalQuote({
      planCode: "INSTITUTIONAL_GROWTH_MONTHLY",
      enrolledChildren: plan.includedChildren,
      pricingVersion: INSTITUTIONAL_PRICING_VERSION,
    });

    expect(selection).toEqual({ includedModules: [], paidModules: [] });
    expect(quote).toMatchObject({
      kind: "priced",
      lines: [
        { component: "BASE", quantity: 1, subtotalPence: plan.basePence },
      ],
      subtotalPence: plan.basePence,
    });
  });
});
