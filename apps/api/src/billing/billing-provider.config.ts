import { BillingProvider } from "@pathway/db";
import { type PlanCode } from "./billing-plans";

export type ActiveBillingProvider = "FAKE" | "STRIPE" | "STRIPE_TEST" | "GOCARDLESS";

export type AddonPriceCode =
  | "AV30_BLOCK_25_MONTHLY"
  | "AV30_BLOCK_25_YEARLY"
  | "AV30_BLOCK_50_MONTHLY"
  | "AV30_BLOCK_50_YEARLY"
  | "STORAGE_100GB_MONTHLY"
  | "STORAGE_100GB_YEARLY"
  | "STORAGE_200GB_MONTHLY"
  | "STORAGE_200GB_YEARLY"
  | "STORAGE_1TB_MONTHLY"
  | "STORAGE_1TB_YEARLY"
  | "SMS_1000_MONTHLY"
  | "SMS_1000_YEARLY";

export type PriceCode = PlanCode | AddonPriceCode;

export type StripePriceMap = Partial<Record<PriceCode, string>>;

export type PriceMapDiagnostics = {
  rawLength: number;
  rawSet: boolean;
  parseSuccess: boolean;
  parseError?: string;
  keysExtracted: string[];
};

export type BillingProviderConfig = {
  activeProvider: ActiveBillingProvider;
  stripe: {
    secretKey?: string;
    webhookSecretSnapshot?: string;
    webhookSecretThin?: string;
    priceMap?: StripePriceMap;
    priceMapDiagnostics?: PriceMapDiagnostics;
    successUrlDefault?: string;
    cancelUrlDefault?: string;
  };
  goCardless: {
    accessToken?: string;
    webhookSecret?: string;
    environment?: "sandbox" | "live";
    baseUrl?: string;
    successUrlDefault?: string;
    cancelUrlDefault?: string;
  };
};

export const BILLING_PROVIDER_CONFIG = Symbol("BILLING_PROVIDER_CONFIG");

const ALLOWED_PRICE_CODES: Set<PriceCode> = new Set([
  "MINIMUM_MONTHLY",
  "MINIMUM_YEARLY",
  "STARTER_MONTHLY",
  "STARTER_YEARLY",
  "GROWTH_MONTHLY",
  "GROWTH_YEARLY",
  "ENTERPRISE_CONTACT",
  "AV30_BLOCK_25_MONTHLY",
  "AV30_BLOCK_25_YEARLY",
  "AV30_BLOCK_50_MONTHLY",
  "AV30_BLOCK_50_YEARLY",
  "STORAGE_100GB_MONTHLY",
  "STORAGE_100GB_YEARLY",
  "STORAGE_200GB_MONTHLY",
  "STORAGE_200GB_YEARLY",
  "STORAGE_1TB_MONTHLY",
  "STORAGE_1TB_YEARLY",
  "SMS_1000_MONTHLY",
  "SMS_1000_YEARLY",
  // Phase 0 PR 0.2: new target-tier plan codes.
  "STARTER_49_MONTHLY",
  "STARTER_49_YEARLY",
  "GROWTH_99_MONTHLY",
  "GROWTH_99_YEARLY",
  "PROFESSIONAL_149_MONTHLY",
  "PROFESSIONAL_149_YEARLY",
]);

type ParsePriceMapResult = {
  map?: StripePriceMap;
  diagnostics: PriceMapDiagnostics;
};

/**
 * Try to parse a JSON object from STRIPE_PRICE_MAP.
 * Handles values that were stored with an extra layer of quoting/escaping
 * (e.g. single-quoted string with escaped \" and \\n from GitHub Secrets / ECS).
 */
function tryParsePriceMapJson(s: string): Record<string, string> | null {
  const noBom = s.replace(/^\uFEFF/, "").trim();
  if (!noBom) return null;

  // 1) Direct parse (plain JSON)
  try {
    const out = JSON.parse(noBom) as unknown;
    if (typeof out === "object" && out !== null && !Array.isArray(out)) {
      return out as Record<string, string>;
    }
    return null;
  } catch {
    // continue to fallbacks
  }

  // 2) Wrapped in single quotes with escaped \" and \\n (common when secret is double-encoded)
  let inner = noBom;
  if (inner.startsWith("'") && inner.endsWith("'")) {
    inner = inner.slice(1, -1);
  }
  inner = inner.replace(/\\n/g, "\n").replace(/\\"/g, '"');
  try {
    const out = JSON.parse(inner) as unknown;
    if (typeof out === "object" && out !== null && !Array.isArray(out)) {
      return out as Record<string, string>;
    }
    return null;
  } catch {
    return null;
  }
}

const parsePriceMap = (raw?: string): ParsePriceMapResult => {
  const trimmed = raw?.trim();
  const rawSet = Boolean(trimmed);
  const rawLength = trimmed?.length ?? 0;

  const emptyDiagnostics: PriceMapDiagnostics = {
    rawLength,
    rawSet,
    parseSuccess: false,
    parseError: rawSet ? "empty_after_trim" : "unset",
    keysExtracted: [],
  };

  if (!trimmed) {
    if (process.env.NODE_ENV === "production") {
      console.warn("[billing] STRIPE_PRICE_MAP unset or empty; pricing unavailable.");
    }
    return { diagnostics: emptyDiagnostics };
  }

  const toParse = trimmed.replace(/^\uFEFF/, "");
  const parsed = tryParsePriceMapJson(toParse);

  if (parsed === null) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[billing] STRIPE_PRICE_MAP invalid JSON (try single-line, no outer quotes in GitHub Secret); rawLength=" +
          rawLength,
      );
    }
    return {
      diagnostics: {
        rawLength,
        rawSet: true,
        parseSuccess: false,
        parseError: "invalid_json",
        keysExtracted: [],
      },
    };
  }

  const filtered: StripePriceMap = {};
  Object.keys(parsed).forEach((code) => {
    const upper = code.toUpperCase();
    const legacyMap: Record<string, PriceCode> = {
      STARTER_MONTH: "STARTER_MONTHLY",
      STARTER_YEAR: "STARTER_YEARLY",
      GROWTH_MONTH: "GROWTH_MONTHLY",
      GROWTH_YEAR: "GROWTH_YEARLY",
      ADDON_AV30_25_MONTH: "AV30_BLOCK_25_MONTHLY",
      ADDON_AV30_25_YEAR: "AV30_BLOCK_25_YEARLY",
      ADDON_AV30_50_MONTH: "AV30_BLOCK_50_MONTHLY",
      ADDON_AV30_50_YEAR: "AV30_BLOCK_50_YEARLY",
      ADDON_STORAGE_100GB_MONTH: "STORAGE_100GB_MONTHLY",
      ADDON_STORAGE_100GB_YEAR: "STORAGE_100GB_YEARLY",
      ADDON_STORAGE_200GB_MONTH: "STORAGE_200GB_MONTHLY",
      ADDON_STORAGE_200GB_YEAR: "STORAGE_200GB_YEARLY",
      ADDON_STORAGE_1TB_MONTH: "STORAGE_1TB_MONTHLY",
      ADDON_STORAGE_1TB_YEAR: "STORAGE_1TB_YEARLY",
      ADDON_SMS_1000_MONTH: "SMS_1000_MONTHLY",
      ADDON_SMS_1000_YEAR: "SMS_1000_YEARLY",
    };
    const mapped = (legacyMap[upper] ?? upper) as PriceCode;
    if (ALLOWED_PRICE_CODES.has(mapped)) {
      filtered[mapped] = parsed[code];
    }
  });
  const keys = Object.keys(filtered);
  if (process.env.NODE_ENV === "production") {
    console.log(
      `[billing] STRIPE_PRICE_MAP parsed: rawLength=${rawLength}, keysExtracted=${keys.length} [${keys.join(", ")}]`,
    );
  }
  return {
    map: keys.length ? filtered : undefined,
    diagnostics: {
      rawLength,
      rawSet: true,
      parseSuccess: true,
      keysExtracted: keys,
    },
  };
};

export function loadBillingProviderConfig(): BillingProviderConfig {
  // Treat empty/whitespace as unset; strip surrounding quotes (e.g. GitHub Secrets "STRIPE")
  const raw = process.env.BILLING_PROVIDER?.trim().replace(/^["']|["']$/g, "")?.trim();
  const active = (raw?.toUpperCase() ?? "FAKE") as ActiveBillingProvider;
  const fallbackSuccess = process.env.BILLING_SUCCESS_URL_DEFAULT ??
    "http://localhost:3000/billing/checkout/success";
  const fallbackCancel = process.env.BILLING_CANCEL_URL_DEFAULT ??
    "http://localhost:3000/billing/checkout/cancel";

  // Use test keys and webhook secret when in STRIPE_TEST mode
  const isTestMode = active === "STRIPE_TEST";
  const secretKey = isTestMode
    ? (process.env.STRIPE_SECRET_KEY_TEST ?? process.env.STRIPE_SECRET_KEY)
    : process.env.STRIPE_SECRET_KEY;
  const webhookSecretSnapshot = isTestMode
    ? process.env.STRIPE_WEBHOOK_SECRET_TEST
    : process.env.STRIPE_WEBHOOK_SECRET_SNAPSHOT;
  const priceMapRaw = isTestMode
    ? (process.env.STRIPE_PRICE_MAP_TEST ?? process.env.STRIPE_PRICE_MAP)
    : process.env.STRIPE_PRICE_MAP;

  const priceMapResult = parsePriceMap(priceMapRaw);
  const stripeConfig = {
    secretKey,
    webhookSecretSnapshot,
    webhookSecretThin: process.env.STRIPE_WEBHOOK_SECRET_THIN,
    priceMap: priceMapResult.map,
    priceMapDiagnostics: priceMapResult.diagnostics,
    successUrlDefault: process.env.STRIPE_SUCCESS_URL ?? fallbackSuccess,
    cancelUrlDefault: process.env.STRIPE_CANCEL_URL ?? fallbackCancel,
  };

  const goCardlessEnv =
    process.env.GOCARDLESS_ENV === "live"
      ? "live"
      : process.env.GOCARDLESS_ENV === "sandbox"
        ? "sandbox"
        : undefined;

  const goCardlessConfig: BillingProviderConfig["goCardless"] = {
    accessToken: process.env.GOCARDLESS_ACCESS_TOKEN,
    webhookSecret: process.env.GOCARDLESS_WEBHOOK_SECRET,
    environment: goCardlessEnv,
    baseUrl: process.env.GOCARDLESS_BASE_URL,
    successUrlDefault: process.env.GOCARDLESS_SUCCESS_URL ?? fallbackSuccess,
    cancelUrlDefault: process.env.GOCARDLESS_CANCEL_URL ?? fallbackCancel,
  };

  const isProd = process.env.NODE_ENV === "production";
  if ((active === "STRIPE" || active === "STRIPE_TEST") && isProd) {
    if (!stripeConfig.secretKey || !stripeConfig.webhookSecretSnapshot) {
      const secretName = active === "STRIPE_TEST" 
        ? "STRIPE_WEBHOOK_SECRET_TEST" 
        : "STRIPE_WEBHOOK_SECRET_SNAPSHOT";
      throw new Error(
        `Stripe billing provider requires STRIPE_SECRET_KEY and ${secretName} in production`,
      );
    }
  }

  if (active === "GOCARDLESS" && isProd) {
    if (!goCardlessConfig.accessToken || !goCardlessConfig.webhookSecret) {
      throw new Error(
        "GoCardless billing provider requires GOCARDLESS_ACCESS_TOKEN and GOCARDLESS_WEBHOOK_SECRET in production",
      );
    }
  }

  const safeActive: ActiveBillingProvider =
    active === "STRIPE" || active === "STRIPE_TEST" || active === "GOCARDLESS" 
      ? active 
      : "FAKE";

  // When provider would be FAKE but Stripe keys are present, use STRIPE so that
  // setting Stripe secrets (without BILLING_PROVIDER or with wrong NODE_ENV) still enables Stripe.
  const stripeFallback =
    safeActive === "FAKE" &&
    Boolean(stripeConfig.secretKey && stripeConfig.webhookSecretSnapshot);

  // Temporarily disable GoCardless until implementation is ready.
  const effectiveActive: ActiveBillingProvider = stripeFallback
    ? "STRIPE"
    : safeActive === "GOCARDLESS"
      ? "FAKE"
      : safeActive;

  // Log effective provider at config load (no secrets) for prod debugging
  if (process.env.NODE_ENV === "production") {
    console.log(
      `[billing] BILLING_PROVIDER env=${raw ?? "(unset)"} → effective=${effectiveActive}`,
    );
  }

  return {
    activeProvider: effectiveActive,
    stripe: stripeConfig,
    goCardless: goCardlessConfig,
  };
}

export function activeProviderToPrismaProvider(
  active: ActiveBillingProvider,
): BillingProvider {
  if (active === "GOCARDLESS") {
    return BillingProvider.GOCARDLESS;
  }
  // Map FAKE to STRIPE for persisted enum compatibility.
  return BillingProvider.STRIPE;
}

