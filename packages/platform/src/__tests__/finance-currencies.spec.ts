import {
  FINANCE_COUNTRY_CURRENCY_OPTIONS,
  FINANCE_CURRENCIES,
  financeCurrencyFractionDigits,
  financeCurrencyForCountry,
} from "../finance-currencies";

describe("Finance country currencies", () => {
  it("offers EUR for all 21 euro-area countries and local currencies for the remaining EU countries", () => {
    const euroArea = FINANCE_COUNTRY_CURRENCY_OPTIONS.filter(
      ({ currency }) => currency === "EUR",
    );
    expect(euroArea.map(({ countryCode }) => countryCode).sort()).toEqual([
      "AT",
      "BE",
      "BG",
      "CY",
      "DE",
      "EE",
      "ES",
      "FI",
      "FR",
      "GR",
      "HR",
      "IE",
      "IT",
      "LT",
      "LU",
      "LV",
      "MT",
      "NL",
      "PT",
      "SI",
      "SK",
    ]);
    const localCurrencies = FINANCE_COUNTRY_CURRENCY_OPTIONS.filter(
      ({ currency, countryCode }) => currency !== "EUR" && countryCode !== "GB",
    ).map(({ countryCode, currency }) => [countryCode, currency]);

    expect(euroArea).toHaveLength(21);
    expect(localCurrencies).toEqual([
      ["CZ", "CZK"],
      ["DK", "DKK"],
      ["HU", "HUF"],
      ["PL", "PLN"],
      ["RO", "RON"],
      ["SE", "SEK"],
    ]);
    expect(financeCurrencyForCountry("GB")).toBe("GBP");
    expect(FINANCE_COUNTRY_CURRENCY_OPTIONS).toHaveLength(28);
    expect(FINANCE_CURRENCIES).toEqual([
      "GBP",
      "EUR",
      "CZK",
      "DKK",
      "HUF",
      "PLN",
      "RON",
      "SEK",
    ]);
    expect(
      FINANCE_CURRENCIES.map((currency) =>
        financeCurrencyFractionDigits(currency),
      ),
    ).toEqual([2, 2, 2, 2, 2, 2, 2, 2]);
  });
});
