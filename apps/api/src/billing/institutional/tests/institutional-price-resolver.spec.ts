import { calculateMappedInstitutionalQuote } from "@pathway/pricing";
import type { BillingPrice } from "../../pricing.service";
import { resolveInstitutionalPrices } from "../institutional-price-resolver";

const price = (
  code: string,
  interval: "month" | "year",
  unitAmount: number,
): BillingPrice => ({
  code,
  priceId: `price_${code.replaceAll("_", "")}`,
  currency: "gbp",
  unitAmount,
  interval,
  intervalCount: 1,
  active: true,
  livemode: false,
  usageType: "licensed",
});

describe("institutional mapped prices", () => {
  it("uses the mapped Stripe amounts without an annual calculation", () => {
    const prices = resolveInstitutionalPrices(
      [
        price("STARTER_49_YEARLY", "year", 51_000),
        price("INSTITUTIONAL_CHILD_UP_TO_100_YEARLY", "year", 1_234),
        price("INSTITUTIONAL_CHILD_101_TO_250_YEARLY", "year", 812),
      ],
      false,
    );
    const quote = calculateMappedInstitutionalQuote({
      planCode: "INSTITUTIONAL_STARTER_YEARLY",
      enrolledChildren: 26,
      storageChoice: "none",
      prices,
    });
    expect(quote.kind).toBe("priced");
    if (quote.kind === "priced") expect(quote.subtotalPence).toBe(52_234);
  });

  it("rejects mapped prices with the wrong interval, mode or billing terms", () => {
    const valid = price("STARTER_49_YEARLY", "year", 51_000);
    expect(
      resolveInstitutionalPrices(
        [
          { ...valid, interval: "month" },
          { ...valid, livemode: true },
          { ...valid, usageType: "metered" },
          { ...valid, currency: "usd" },
          { ...valid, active: false },
          { ...valid, intervalCount: 2 },
        ],
        false,
      ),
    ).toEqual({});
  });
});
