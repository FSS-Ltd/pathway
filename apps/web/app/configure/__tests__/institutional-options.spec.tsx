import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InstitutionalStorageStep } from "../steps/institutional-options";

describe("institutional storage selection", () => {
  it("shows mapped prices and makes an unmapped interval unavailable", () => {
    const html = renderToStaticMarkup(
      createElement(InstitutionalStorageStep, {
        choice: "none",
        interval: "month",
        priceOptions: [
          {
            choice: "none",
            monthlyPricePence: 0,
            yearlyPricePence: 0,
          },
          {
            choice: "100",
            monthlyPricePence: 149,
            yearlyPricePence: 1_599,
          },
          {
            choice: "200",
            monthlyPricePence: null,
            yearlyPricePence: null,
          },
          {
            choice: "1000",
            monthlyPricePence: 599,
            yearlyPricePence: 5_999,
          },
        ],
        onSelect: jest.fn(),
      }),
    );

    expect(html).toContain("£1.49 per month");
    expect(html).toContain("Unavailable for this billing period");
    expect(html).toContain("No extra charge");
  });
});
