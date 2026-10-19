CREATE TYPE "FinanceCountry" AS ENUM (
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
  'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
  'SI', 'ES', 'SE', 'GB'
);

ALTER TABLE "FinanceProfile"
  ADD COLUMN "countryCode" "FinanceCountry" NOT NULL DEFAULT 'GB';

ALTER TABLE "FinanceProfile"
  ADD CONSTRAINT "FinanceProfile_country_currency_consistent" CHECK (
    ("countryCode" = 'GB' AND "currency" = 'GBP')
    OR ("countryCode" IN (
      'AT', 'BE', 'BG', 'HR', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE',
      'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES'
    ) AND "currency" = 'EUR')
    OR ("countryCode" = 'CZ' AND "currency" = 'CZK')
    OR ("countryCode" = 'DK' AND "currency" = 'DKK')
    OR ("countryCode" = 'HU' AND "currency" = 'HUF')
    OR ("countryCode" = 'PL' AND "currency" = 'PLN')
    OR ("countryCode" = 'RO' AND "currency" = 'RON')
    OR ("countryCode" = 'SE' AND "currency" = 'SEK')
  );
