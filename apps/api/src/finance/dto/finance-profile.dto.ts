import { z } from "zod";
import {
  FINANCE_CURRENCIES,
  financeCurrencyForCountry,
  isFinanceCountryCode,
} from "@pathway/platform";

export const financeProfileSettingsSchema = z
  .object({
    legalEntityName: z.string().trim().min(1).max(255),
    countryCode: z.string().refine(isFinanceCountryCode),
    currency: z.enum(FINANCE_CURRENCIES),
  })
  .strict()
  .refine(
    (input) => financeCurrencyForCountry(input.countryCode) === input.currency,
    { path: ["currency"], message: "Currency must match the school country" },
  );

export type FinanceProfileSettingsInput = z.infer<
  typeof financeProfileSettingsSchema
>;
