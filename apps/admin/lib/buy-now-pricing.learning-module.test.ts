import assert from "node:assert/strict";
import {
  ADDON_PRICES,
  calculateCartTotals,
  mergeBillingPrices,
} from "./buy-now-pricing";

const totals = calculateCartTotals({
  planCode: "STARTER_49_YEARLY",
  storageChoice: "none",
  learningModule: true,
});

assert.equal(ADDON_PRICES.MODULE_LEARNING_YEARLY.amountMajor, 290);
assert.equal(totals.totalMajor, 780);

const { addonPrices } = mergeBillingPrices([
  {
    code: "MODULE_LEARNING_MONTHLY",
    unitAmount: 2900,
    interval: "month",
  },
]);

assert.equal(addonPrices.MODULE_LEARNING_MONTHLY?.amountMajor, 29);
