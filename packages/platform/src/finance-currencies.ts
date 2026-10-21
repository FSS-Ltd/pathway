export const FINANCE_COUNTRY_CURRENCY_OPTIONS = [
  { countryCode: "AT", countryName: "Austria", currency: "EUR" },
  { countryCode: "BE", countryName: "Belgium", currency: "EUR" },
  { countryCode: "BG", countryName: "Bulgaria", currency: "EUR" },
  { countryCode: "HR", countryName: "Croatia", currency: "EUR" },
  { countryCode: "CY", countryName: "Cyprus", currency: "EUR" },
  { countryCode: "CZ", countryName: "Czechia", currency: "CZK" },
  { countryCode: "DK", countryName: "Denmark", currency: "DKK" },
  { countryCode: "EE", countryName: "Estonia", currency: "EUR" },
  { countryCode: "FI", countryName: "Finland", currency: "EUR" },
  { countryCode: "FR", countryName: "France", currency: "EUR" },
  { countryCode: "DE", countryName: "Germany", currency: "EUR" },
  { countryCode: "GR", countryName: "Greece", currency: "EUR" },
  { countryCode: "HU", countryName: "Hungary", currency: "HUF" },
  { countryCode: "IE", countryName: "Ireland", currency: "EUR" },
  { countryCode: "IT", countryName: "Italy", currency: "EUR" },
  { countryCode: "LV", countryName: "Latvia", currency: "EUR" },
  { countryCode: "LT", countryName: "Lithuania", currency: "EUR" },
  { countryCode: "LU", countryName: "Luxembourg", currency: "EUR" },
  { countryCode: "MT", countryName: "Malta", currency: "EUR" },
  { countryCode: "NL", countryName: "Netherlands", currency: "EUR" },
  { countryCode: "PL", countryName: "Poland", currency: "PLN" },
  { countryCode: "PT", countryName: "Portugal", currency: "EUR" },
  { countryCode: "RO", countryName: "Romania", currency: "RON" },
  { countryCode: "SK", countryName: "Slovakia", currency: "EUR" },
  { countryCode: "SI", countryName: "Slovenia", currency: "EUR" },
  { countryCode: "ES", countryName: "Spain", currency: "EUR" },
  { countryCode: "SE", countryName: "Sweden", currency: "SEK" },
  { countryCode: "GB", countryName: "United Kingdom", currency: "GBP" },
] as const;

export const FINANCE_CURRENCIES = [
  "GBP",
  "EUR",
  "CZK",
  "DKK",
  "HUF",
  "PLN",
  "RON",
  "SEK",
] as const;

export type FinanceCountryCode =
  (typeof FINANCE_COUNTRY_CURRENCY_OPTIONS)[number]["countryCode"];
export type FinanceCurrency = (typeof FINANCE_CURRENCIES)[number];

export const FINANCE_CURRENCY_FRACTION_DIGITS = {
  GBP: 2,
  EUR: 2,
  CZK: 2,
  DKK: 2,
  HUF: 2,
  PLN: 2,
  RON: 2,
  SEK: 2,
} as const satisfies Record<FinanceCurrency, number>;

export const FINANCE_CURRENCY_NAMES: Record<FinanceCurrency, string> = {
  GBP: "Pound sterling",
  EUR: "Euro",
  CZK: "Czech koruna",
  DKK: "Danish krone",
  HUF: "Hungarian forint",
  PLN: "Polish złoty",
  RON: "Romanian leu",
  SEK: "Swedish krona",
};

export function isFinanceCountryCode(
  value: string,
): value is FinanceCountryCode {
  return FINANCE_COUNTRY_CURRENCY_OPTIONS.some(
    (option) => option.countryCode === value,
  );
}

export function financeCurrencyForCountry(
  countryCode: FinanceCountryCode,
): FinanceCurrency {
  const country = FINANCE_COUNTRY_CURRENCY_OPTIONS.find(
    (option) => option.countryCode === countryCode,
  );
  if (!country) throw new RangeError("Finance country is not supported");
  return country.currency;
}

export function isFinanceCurrency(value: string): value is FinanceCurrency {
  return FINANCE_CURRENCIES.some((currency) => currency === value);
}

export function financeCurrencyFractionDigits(
  currency: FinanceCurrency,
): number {
  return FINANCE_CURRENCY_FRACTION_DIGITS[currency];
}
