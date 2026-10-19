import { financeProfileSettingsSchema } from "./finance-profile.dto";

describe("financeProfileSettingsSchema", () => {
  it("accepts the default local currency for a supported European country", () => {
    expect(
      financeProfileSettingsSchema.safeParse({
        legalEntityName: "Dutch School",
        countryCode: "NL",
        currency: "EUR",
      }).success,
    ).toBe(true);
  });

  it("rejects a currency that does not match the school's country", () => {
    expect(
      financeProfileSettingsSchema.safeParse({
        legalEntityName: "Dutch School",
        countryCode: "NL",
        currency: "GBP",
      }).success,
    ).toBe(false);
  });

  it("rejects countries outside the supported local-currency set", () => {
    expect(
      financeProfileSettingsSchema.safeParse({
        legalEntityName: "School",
        countryCode: "US",
        currency: "USD",
      }).success,
    ).toBe(false);
  });
});
