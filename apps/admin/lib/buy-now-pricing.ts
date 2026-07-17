export type PlanCode =
  | "STARTER_49_MONTHLY"
  | "STARTER_49_YEARLY"
  | "GROWTH_99_MONTHLY"
  | "GROWTH_99_YEARLY"
  | "PROFESSIONAL_149_MONTHLY"
  | "PROFESSIONAL_149_YEARLY"
  | "ENTERPRISE_CONTACT";

export type StripePriceMeta = {
  stripePriceId: string;
  amountMajor: number; // e.g. 149 -> £149
  currency: "gbp";
  interval: "month" | "year";
  label: string;
};

export const PLAN_PRICES: Record<Exclude<PlanCode, "ENTERPRISE_CONTACT">, StripePriceMeta> = {
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

export const ADDON_PRICES = {
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
      p.code === "STARTER_49_MONTHLY" ||
      p.code === "STARTER_49_YEARLY" ||
      p.code === "GROWTH_99_MONTHLY" ||
      p.code === "GROWTH_99_YEARLY" ||
      p.code === "PROFESSIONAL_149_MONTHLY" ||
      p.code === "PROFESSIONAL_149_YEARLY"
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

