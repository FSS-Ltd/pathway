export type PlanCode =
  | "STARTER_MONTHLY"
  | "STARTER_YEARLY"
  | "GROWTH_MONTHLY"
  | "GROWTH_YEARLY"
  | "ENTERPRISE_CONTACT";

export type StripePriceMeta = {
  stripePriceId: string;
  amountMajor: number; // e.g. 149 -> £149
  currency: "gbp";
  interval: "month" | "year";
  label: string;
};

export const PLAN_PRICES: Record<Exclude<PlanCode, "ENTERPRISE_CONTACT">, StripePriceMeta> = {
  STARTER_MONTHLY: {
    stripePriceId: "price_starter_monthly",
    amountMajor: 149,
    currency: "gbp",
    interval: "month",
    label: "£149 / month",
  },
  STARTER_YEARLY: {
    stripePriceId: "price_starter_annual",
    amountMajor: 1490,
    currency: "gbp",
    interval: "year",
    label: "£1,490 / year",
  },
  GROWTH_MONTHLY: {
    stripePriceId: "price_growth_monthly",
    amountMajor: 399,
    currency: "gbp",
    interval: "month",
    label: "£399 / month",
  },
  GROWTH_YEARLY: {
    stripePriceId: "price_growth_annual",
    amountMajor: 3990,
    currency: "gbp",
    interval: "year",
    label: "£3,990 / year",
  },
};

export const ADDON_PRICES = {
  AV30_BLOCK_25_MONTHLY: {
    amountMajor: 39,
    label: "+25 Active People - £39 / month",
  },
  AV30_BLOCK_25_YEARLY: {
    amountMajor: 390,
    label: "+25 Active People - £390 / year",
  },
  AV30_BLOCK_50_MONTHLY: {
    amountMajor: 59,
    label: "+50 Active People - £59 / month",
  },
  AV30_BLOCK_50_YEARLY: {
    amountMajor: 590,
    label: "+50 Active People - £590 / year",
  },
  STORAGE_100GB_MONTHLY: {
    amountMajor: 25,
    label: "+100GB storage - £25 / month",
  },
  STORAGE_100GB_YEARLY: {
    amountMajor: 250,
    label: "+100GB storage - £250 / year",
  },
  STORAGE_200GB_MONTHLY: {
    amountMajor: 45,
    label: "+200GB storage - £45 / month",
  },
  STORAGE_200GB_YEARLY: {
    amountMajor: 450,
    label: "+200GB storage - £450 / year",
  },
  STORAGE_1TB_MONTHLY: {
    amountMajor: 59.99,
    label: "+1TB storage - £59.99 / month",
  },
  STORAGE_1TB_YEARLY: {
    amountMajor: 1500,
    label: "+1TB storage - £1,500 / year",
  },
} as const;

export type AdminSelection = {
  planCode: PlanCode;
  av30BlockCount?: number;
  storageChoice?: "none" | "100" | "200" | "1000";
};

export type CartTotals = {
  currency: "gbp";
  subtotalMajor: number;
  totalMajor: number;
  lines: { label: string; amountMajor: number }[];
};

const formatAmount = (amountMajor: number) => {
  const hasFraction = Math.abs(amountMajor % 1) > 0.000001;
  return amountMajor.toLocaleString("en-GB", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  });
};

export function calculateCartTotals(
  selection: AdminSelection | null,
  opts?: {
    planPrices?: Partial<Record<PlanCode, StripePriceMeta>>;
    addonPrices?: Partial<
      Record<keyof typeof ADDON_PRICES, { amountMajor: number; label: string }>
    >;
    /** When true, omit the plan line from totals (e.g. "add add-ons only" on current plan). */
    excludePlanLine?: boolean;
  },
): CartTotals {
  const lines: CartTotals["lines"] = [];
  if (!selection) {
    return { currency: "gbp", subtotalMajor: 0, totalMajor: 0, lines };
  }

  const planPrices = { ...PLAN_PRICES, ...(opts?.planPrices ?? {}) };
  const addonPrices = { ...ADDON_PRICES, ...(opts?.addonPrices ?? {}) };

  const planMeta =
    selection.planCode !== "ENTERPRISE_CONTACT"
      ? planPrices[selection.planCode]
      : undefined;
  if (planMeta && !opts?.excludePlanLine) {
    lines.push({ label: planMeta.label, amountMajor: planMeta.amountMajor });
  }

  const qty = Math.max(0, Math.trunc(selection.av30BlockCount ?? 0));
  if (qty > 0 && selection.planCode !== "ENTERPRISE_CONTACT") {
    const isGrowth = selection.planCode.startsWith("GROWTH");
    const isYearly = selection.planCode.endsWith("YEARLY");
    const addon =
      addonPrices[
        `${isGrowth ? "AV30_BLOCK_50" : "AV30_BLOCK_25"}_${
          isYearly ? "YEARLY" : "MONTHLY"
        }` as keyof typeof ADDON_PRICES
      ];
    lines.push({
      label: `${addon.label} × ${qty}`,
      amountMajor: addon.amountMajor * qty,
    });
  }

  if (selection.storageChoice && selection.storageChoice !== "none") {
    const isYearly = selection.planCode.endsWith("YEARLY");
    const suffix = isYearly ? "YEARLY" : "MONTHLY";
    const storageLine =
      selection.storageChoice === "100"
        ? addonPrices[`STORAGE_100GB_${suffix}` as keyof typeof addonPrices]
        : selection.storageChoice === "200"
          ? addonPrices[`STORAGE_200GB_${suffix}` as keyof typeof addonPrices]
          : addonPrices[`STORAGE_1TB_${suffix}` as keyof typeof addonPrices];
    if (storageLine) {
      lines.push({
        label: storageLine.label,
        amountMajor: storageLine.amountMajor,
      });
    }
  }

  const subtotalMajor = lines.reduce((sum, line) => sum + line.amountMajor, 0);
  return { currency: "gbp", subtotalMajor, totalMajor: subtotalMajor, lines };
}

export function mergeBillingPrices(
  prices: { code: string; unitAmount: number; interval: "month" | "year" | null }[],
): {
  planPrices: Partial<Record<PlanCode, StripePriceMeta>>;
  addonPrices: Partial<Record<keyof typeof ADDON_PRICES, { amountMajor: number; label: string }>>;
} {
  const planPrices: Partial<Record<PlanCode, StripePriceMeta>> = {};
  const addonPrices: Partial<Record<keyof typeof ADDON_PRICES, { amountMajor: number; label: string }>> =
    {};

  prices.forEach((p) => {
    const amountMajor =
      typeof p.unitAmount === "number" ? Number((p.unitAmount / 100).toFixed(2)) : 0;
    if (!amountMajor) return;
    const interval = p.interval ?? "month";

    if (
      p.code === "STARTER_MONTHLY" ||
      p.code === "STARTER_YEARLY" ||
      p.code === "GROWTH_MONTHLY" ||
      p.code === "GROWTH_YEARLY"
    ) {
      planPrices[p.code] = {
        stripePriceId: "",
        amountMajor,
        currency: "gbp",
        interval,
        label: `£${formatAmount(amountMajor)} / ${interval === "month" ? "month" : "year"}`,
      };
      return;
    }

    const addonKey = p.code as keyof typeof ADDON_PRICES;
    if (addonKey in ADDON_PRICES) {
      addonPrices[addonKey] = {
        amountMajor,
        label: ADDON_PRICES[addonKey].label.replace(
          /\£[\d,]+/,
          `£${formatAmount(amountMajor)}`,
        ),
      };
    }
  });

  return { planPrices, addonPrices };
}

