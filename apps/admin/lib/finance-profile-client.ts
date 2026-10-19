import {
  FINANCE_CURRENCIES,
  financeCurrencyForCountry,
  isFinanceCountryCode,
  type FinanceCountryCode,
  type FinanceCurrency,
} from "@pathway/platform/finance-currencies";
import { API_BASE_URL, apiFetch } from "./api-client";
import { apiErrorFromResponse } from "./api-transport";

export type FinanceProfileSettings = {
  legalEntityName: string;
  countryCode: FinanceCountryCode;
  currency: FinanceCurrency;
};

export type FinanceProfileSettingsResponse = {
  profile: FinanceProfileSettings | null;
  countries: readonly {
    countryCode: FinanceCountryCode;
    countryName: string;
    currency: FinanceCurrency;
  }[];
  configurationLocked: boolean;
};

export async function fetchFinanceProfileSettings(): Promise<FinanceProfileSettingsResponse> {
  const response = await apiFetch(`${API_BASE_URL}/finance/profile`);
  if (!response.ok) {
    throw await apiErrorFromResponse(
      response,
      "Finance settings could not be loaded.",
    );
  }
  const payload: unknown = await response.json();
  return parseFinanceProfileSettingsResponse(payload);
}

export async function saveFinanceProfileSettings(
  value: FinanceProfileSettings,
): Promise<FinanceProfileSettings> {
  const input = parseFinanceProfileSettings(value);
  const response = await apiFetch(`${API_BASE_URL}/finance/profile`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw await apiErrorFromResponse(
      response,
      "Finance settings could not be saved.",
    );
  }
  const payload: unknown = await response.json();
  return parseFinanceProfileSettings(payload);
}

function parseFinanceProfileSettingsResponse(
  value: unknown,
): FinanceProfileSettingsResponse {
  if (!isRecord(value) || !isUnknownArray(value.countries)) {
    throw invalidFinanceProfileResponse();
  }

  const profile =
    value.profile === null ? null : parseFinanceProfileSettings(value.profile);
  const countries = value.countries.map(parseFinanceCountryOption);
  if (typeof value.configurationLocked !== "boolean") {
    throw invalidFinanceProfileResponse();
  }

  return { profile, countries, configurationLocked: value.configurationLocked };
}

function parseFinanceProfileSettings(value: unknown): FinanceProfileSettings {
  if (
    !isRecord(value) ||
    typeof value.legalEntityName !== "string" ||
    typeof value.countryCode !== "string" ||
    !isFinanceCountryCode(value.countryCode) ||
    typeof value.currency !== "string" ||
    !isFinanceCurrency(value.currency) ||
    financeCurrencyForCountry(value.countryCode) !== value.currency
  ) {
    throw invalidFinanceProfileResponse();
  }

  const legalEntityName = value.legalEntityName.trim();
  if (legalEntityName.length === 0 || legalEntityName.length > 255) {
    throw new Error("Enter a legal entity name between 1 and 255 characters.");
  }

  return {
    legalEntityName,
    countryCode: value.countryCode,
    currency: value.currency,
  };
}

function parseFinanceCountryOption(
  value: unknown,
): FinanceProfileSettingsResponse["countries"][number] {
  if (
    !isRecord(value) ||
    typeof value.countryCode !== "string" ||
    !isFinanceCountryCode(value.countryCode) ||
    typeof value.countryName !== "string" ||
    typeof value.currency !== "string" ||
    !isFinanceCurrency(value.currency) ||
    financeCurrencyForCountry(value.countryCode) !== value.currency
  ) {
    throw invalidFinanceProfileResponse();
  }

  return {
    countryCode: value.countryCode,
    countryName: value.countryName,
    currency: value.currency,
  };
}

function isFinanceCurrency(value: string): value is FinanceCurrency {
  return FINANCE_CURRENCIES.some((currency) => currency === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function invalidFinanceProfileResponse(): Error {
  return new Error("Finance settings response was invalid.");
}
