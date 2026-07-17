/**
 * Frontend-only Stripe price metadata for the public Buy Now flow.
 * This maps plan/add-on codes to Stripe price ids and display amounts.
 * Billing authority remains on the backend (Stripe + snapshot webhooks),
 * so keep these codes consistent with `apps/api/src/billing/billing-plans.ts`.
 */

export type BillingInterval = "month" | "year";

export type PlanCode =
  | "STARTER_49_MONTHLY"
  | "STARTER_49_YEARLY"
  | "GROWTH_99_MONTHLY"
  | "GROWTH_99_YEARLY"
  | "PROFESSIONAL_149_MONTHLY"
  | "PROFESSIONAL_149_YEARLY";

export type AddonCode =
  | "STORAGE_100GB_MONTHLY"
  | "STORAGE_100GB_YEARLY"
  | "STORAGE_200GB_MONTHLY"
  | "STORAGE_200GB_YEARLY"
  | "STORAGE_1TB_MONTHLY"
  | "STORAGE_1TB_YEARLY";

export type StripePriceMeta = {
  stripePriceId: string;
  amountMajor: number; // e.g. 149 => £149
  currency: "gbp";
  interval: BillingInterval;
  label: string;
};

export const PLAN_PRICES: Record<PlanCode, StripePriceMeta> = {
  STARTER_49_MONTHLY: {
    stripePriceId: "price_starter49_monthly",
    amountMajor: 49,
    currency: "gbp",
    interval: "month",
    label: "£49 / month",
  },
  STARTER_49_YEARLY: {
    stripePriceId: "price_starter49_annual",
    amountMajor: 490,
    currency: "gbp",
    interval: "year",
    label: "£490 / year",
  },
  GROWTH_99_MONTHLY: {
    stripePriceId: "price_growth99_monthly",
    amountMajor: 99,
    currency: "gbp",
    interval: "month",
    label: "£99 / month",
  },
  GROWTH_99_YEARLY: {
    stripePriceId: "price_growth99_annual",
    amountMajor: 990,
    currency: "gbp",
    interval: "year",
    label: "£990 / year",
  },
  PROFESSIONAL_149_MONTHLY: {
    stripePriceId: "price_professional149_monthly",
    amountMajor: 149,
    currency: "gbp",
    interval: "month",
    label: "£149 / month",
  },
  PROFESSIONAL_149_YEARLY: {
    stripePriceId: "price_professional149_annual",
    amountMajor: 1490,
    currency: "gbp",
    interval: "year",
    label: "£1,490 / year",
  },
};

export const ADDON_PRICES: Record<AddonCode, StripePriceMeta> = {
  STORAGE_100GB_MONTHLY: {
    stripePriceId: "price_storage_100gb_monthly",
    amountMajor: 25,
    currency: "gbp",
    interval: "month",
    label: "+100GB storage - £25 / month",
  },
  STORAGE_100GB_YEARLY: {
    stripePriceId: "price_storage_100gb_annual",
    amountMajor: 250,
    currency: "gbp",
    interval: "year",
    label: "+100GB storage - £250 / year",
  },
  STORAGE_200GB_MONTHLY: {
    stripePriceId: "price_storage_200gb_monthly",
    amountMajor: 45,
    currency: "gbp",
    interval: "month",
    label: "+200GB storage - £45 / month",
  },
  STORAGE_200GB_YEARLY: {
    stripePriceId: "price_storage_200gb_annual",
    amountMajor: 450,
    currency: "gbp",
    interval: "year",
    label: "+200GB storage - £450 / year",
  },
  STORAGE_1TB_MONTHLY: {
    stripePriceId: "price_storage_1tb_monthly",
    amountMajor: 59.99,
    currency: "gbp",
    interval: "month",
    label: "+1TB storage - £59.99 / month",
  },
  STORAGE_1TB_YEARLY: {
    stripePriceId: "price_storage_1tb_annual",
    amountMajor: 1500,
    currency: "gbp",
    interval: "year",
    label: "+1TB storage - £1,500 / year",
  },
};

export type BuyNowSelection = {
  planCode: PlanCode;
  frequency: "monthly" | "yearly";
  storageAddon100Gb?: number;
  storageAddon200Gb?: number;
  storageAddon1Tb?: number;
};

export type CartTotals = {
  currency: "gbp";
  subtotalMajor: number;
  totalMajor: number;
  lines: { label: string; amountMajor: number }[];
};

export function calculateCartTotals(
  selection: BuyNowSelection,
  opts?: {
    planPrices?: Partial<Record<PlanCode, StripePriceMeta>>;
    addonPrices?: Partial<
      Record<AddonCode, { stripePriceId?: string; amountMajor: number; label: string }>
    >;
  },
): CartTotals {
  const lines: CartTotals["lines"] = [];

  const planPrices = { ...PLAN_PRICES, ...(opts?.planPrices ?? {}) };
  const planMeta = planPrices[selection.planCode];
  if (planMeta) {
    lines.push({ label: planMeta.label, amountMajor: planMeta.amountMajor });
  }

  const addLine = (
    label: string,
    unit: { amountMajor: number } | undefined,
    quantity: number | undefined,
  ) => {
    if (!unit) return;
    const qty = Math.max(0, Math.trunc(quantity ?? 0));
    if (!qty) return;
    lines.push({
      label: `${label} × ${qty}`,
      amountMajor: unit.amountMajor * qty,
    });
  };

  const intervalKey = selection.frequency === "yearly" ? "YEARLY" : "MONTHLY";
  const addonPrices = { ...ADDON_PRICES, ...(opts?.addonPrices ?? {}) };
  const intervalLabel = selection.frequency === "monthly" ? " (monthly)" : " (yearly)";

  addLine(
    `+100GB storage${intervalLabel}`,
    addonPrices[`STORAGE_100GB_${intervalKey}` as AddonCode],
    selection.storageAddon100Gb,
  );
  addLine(
    `+200GB storage${intervalLabel}`,
    addonPrices[`STORAGE_200GB_${intervalKey}` as AddonCode],
    selection.storageAddon200Gb,
  );
  addLine(
    `+1TB storage${intervalLabel}`,
    addonPrices[`STORAGE_1TB_${intervalKey}` as AddonCode],
    selection.storageAddon1Tb,
  );

  const subtotalMajor = lines.reduce((sum, line) => sum + line.amountMajor, 0);

  return {
    currency: "gbp",
    subtotalMajor,
    totalMajor: subtotalMajor,
    lines,
  };
}

export function mergeBillingPrices(
  prices: { code: string; unitAmount: number; interval: "month" | "year" | null }[],
): {
  planPrices: Partial<Record<PlanCode, StripePriceMeta>>;
  addonPrices: Partial<Record<AddonCode, { amountMajor: number; label: string; stripePriceId?: string }>>;
} {
  const planPrices: Partial<Record<PlanCode, StripePriceMeta>> = {};
  const addonPrices: Partial<
    Record<AddonCode, { amountMajor: number; label: string; stripePriceId?: string }>
  > = {};

  prices.forEach((p) => {
    const amountMajor =
      typeof p.unitAmount === "number" ? Number((p.unitAmount / 100).toFixed(2)) : 0;
    if (!amountMajor) return;
    const interval = p.interval ?? "month";

    if (
      p.code === "STARTER_49_MONTHLY" ||
      p.code === "STARTER_49_YEARLY" ||
      p.code === "GROWTH_99_MONTHLY" ||
      p.code === "GROWTH_99_YEARLY" ||
      p.code === "PROFESSIONAL_149_MONTHLY" ||
      p.code === "PROFESSIONAL_149_YEARLY"
    ) {
      planPrices[p.code as PlanCode] = {
        stripePriceId: "",
        amountMajor,
        currency: "gbp",
        interval,
        label: `£${amountMajor.toLocaleString("en-GB")} / ${interval === "month" ? "month" : "year"}`,
      };
      return;
    }

    const addonKey = p.code as AddonCode;
    if (addonKey in ADDON_PRICES) {
      addonPrices[addonKey] = {
        amountMajor,
        stripePriceId: "",
        label: ADDON_PRICES[addonKey].label.replace(
          /£[\d,]+/,
          `£${amountMajor.toLocaleString("en-GB")}`,
        ),
      };
    }
  });

  return { planPrices, addonPrices };
}

