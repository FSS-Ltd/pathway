import {
  calculateDeclaredCapacityQuote,
  declaredCapacityPlanCode,
  type DeclaredCapacityPriceCode,
  type DeclaredCapacityQuoteInput,
  type DeclaredCapacityQuoteLine,
  type DeclaredCapacityResolvedPrices,
  type DeclaredCapacityTier,
} from "@pathway/pricing";
import { Module } from "@pathway/db";
import { z } from "zod";
import {
  approvedDeclaredCapacityAddonModules,
  declaredCapacityAddonPriceCode,
  deliveredDeclaredCapacityAddonModules,
  isDeclaredCapacityAddonModule,
  type DeclaredCapacityAddonModule,
  type DeclaredCapacityAddonPriceCode,
} from "./declared-capacity-addons";

export type DeclaredCapacityStripeLine = DeclaredCapacityQuoteLine &
  Readonly<{ priceId: string; currency: "GBP" }>;
type DeclaredCapacityAddonStripeLine = Readonly<{
  component: "ADDON";
  priceCode: DeclaredCapacityAddonPriceCode;
  priceId: string;
  currency: "GBP";
  quantity: 1;
  unitAmountPence: number;
  subtotalPence: number;
}>;

export type DeclaredCapacityStripeQuote = Readonly<{
  kind: "priced";
  pricingVersion: "DECLARED_CAPACITY_V2";
  planCode: string;
  tier: Exclude<DeclaredCapacityTier, "enterprise">;
  declaredCapacity: number;
  interval: "month" | "year";
  currency: "GBP";
  siteAllowance: number;
  trialModuleSlots: number;
  includedPaidModules: readonly never[];
  lines: readonly (
    | DeclaredCapacityStripeLine
    | DeclaredCapacityAddonStripeLine
  )[];
  paidModules: readonly DeclaredCapacityAddonModule[];
  trialModules: readonly DeclaredCapacityAddonModule[];
  subtotalPence: number;
}>;

export type DeclaredCapacityStripeResolvedPrices =
  DeclaredCapacityResolvedPrices &
    Partial<
      Record<
        DeclaredCapacityAddonPriceCode,
        { priceId: string; unitAmountPence: number }
      >
    >;

export function isDeclaredCapacityAddonTrialReady(
  module: Module,
  prices: DeclaredCapacityStripeResolvedPrices,
): boolean {
  try {
    return validateAddonSelection([module], prices, "month", true).length === 1;
  } catch (error) {
    if (error instanceof DeclaredCapacityStripePriceError) return false;
    if (
      error instanceof Error &&
      error.message === "INVALID_DECLARED_CAPACITY_ADDON_SELECTION"
    ) {
      return false;
    }
    throw error;
  }
}

export function isDeclaredCapacityAddonPaidReady(
  module: Module,
  interval: DeclaredCapacityQuoteInput["interval"],
  prices: DeclaredCapacityStripeResolvedPrices,
): boolean {
  try {
    return (
      validateAddonSelection([module], prices, interval, false).length === 1
    );
  } catch (error) {
    if (error instanceof DeclaredCapacityStripePriceError) return false;
    if (
      error instanceof Error &&
      error.message === "INVALID_DECLARED_CAPACITY_ADDON_SELECTION"
    ) {
      return false;
    }
    throw error;
  }
}

export class DeclaredCapacityStripePriceError extends Error {
  constructor(
    readonly priceCode:
      | DeclaredCapacityPriceCode
      | DeclaredCapacityAddonPriceCode,
  ) {
    super(`MISSING_OR_INVALID_DECLARED_CAPACITY_PRICE:${priceCode}`);
    this.name = "DeclaredCapacityStripePriceError";
  }
}

const frozenDeclaredLineSchema = z.object({
  component: z.enum(["BASE", "DECLARED_CAPACITY", "ADDON"]),
  priceCode: z.string(),
  priceId: z.string().regex(/^price_[A-Za-z0-9]+$/),
  currency: z.literal("GBP"),
  quantity: z.number().int().nonnegative().safe(),
  unitAmountPence: z.number().int().positive().safe(),
  subtotalPence: z.number().int().nonnegative().safe(),
});

export function quoteDeclaredCapacityWithStripePrices(
  input: DeclaredCapacityQuoteInput,
  prices: DeclaredCapacityStripeResolvedPrices,
  selections: Readonly<{
    paidModules?: readonly Module[];
    trialModules?: readonly Module[];
  }> = {},
): DeclaredCapacityStripeQuote | { kind: "contact_sales" } {
  const quote = calculateDeclaredCapacityQuote(input);
  if (quote.kind !== "priced") return { kind: "contact_sales" };

  const paidModules = validateAddonSelection(
    selections.paidModules ?? [],
    prices,
    input.interval,
    false,
  );
  const trialModules = validateAddonSelection(
    selections.trialModules ?? [],
    prices,
    input.interval,
    true,
  );
  const allSelected = [...paidModules, ...trialModules];
  if (
    new Set(allSelected).size !== allSelected.length ||
    trialModules.length > quote.trialModuleSlots
  ) {
    throw new Error("INVALID_DECLARED_CAPACITY_ADDON_SELECTION");
  }

  const lines: Array<
    DeclaredCapacityStripeLine | DeclaredCapacityAddonStripeLine
  > = quote.lines.map((line): DeclaredCapacityStripeLine => {
    const price = prices[line.priceCode];
    if (
      !price ||
      price.unitAmountPence !== line.unitAmountPence ||
      !/^price_[A-Za-z0-9]+$/.test(price.priceId)
    ) {
      throw new DeclaredCapacityStripePriceError(line.priceCode);
    }
    return { ...line, priceId: price.priceId, currency: "GBP" };
  });
  const selectedPriceIds = new Set(
    lines.filter((line) => line.quantity > 0).map((line) => line.priceId),
  );
  if (
    selectedPriceIds.size !== lines.filter((line) => line.quantity > 0).length
  ) {
    const duplicate = lines.find(
      (line, index, all) =>
        line.quantity > 0 &&
        all.findIndex(
          (candidate) =>
            candidate.quantity > 0 && candidate.priceId === line.priceId,
        ) !== index,
    );
    throw new DeclaredCapacityStripePriceError(
      duplicate?.priceCode ?? "DECLARED_CAPACITY_BASE_MONTHLY",
    );
  }

  for (const module of paidModules) {
    const priceCode = declaredCapacityAddonPriceCode(module, input.interval);
    const price = prices[priceCode];
    if (
      !price ||
      !Number.isSafeInteger(price.unitAmountPence) ||
      price.unitAmountPence <= 0 ||
      !/^price_[A-Za-z0-9]+$/.test(price.priceId)
    ) {
      throw new DeclaredCapacityStripePriceError(priceCode);
    }
    if (selectedPriceIds.has(price.priceId)) {
      throw new DeclaredCapacityStripePriceError(priceCode);
    }
    selectedPriceIds.add(price.priceId);
    lines.push({
      component: "ADDON",
      priceCode,
      priceId: price.priceId,
      currency: "GBP",
      quantity: 1,
      unitAmountPence: price.unitAmountPence,
      subtotalPence: price.unitAmountPence,
    });
  }

  const subtotalPence = lines.reduce(
    (total, line) => total + line.subtotalPence,
    0,
  );
  if (!Number.isSafeInteger(subtotalPence)) {
    throw new Error("INVALID_DECLARED_CAPACITY_QUOTE_TOTAL");
  }

  return {
    ...quote,
    planCode: declaredCapacityPlanCode(quote.tier, input.interval),
    lines,
    paidModules,
    trialModules,
    subtotalPence,
  };
}

export function quoteDeclaredCapacityWithFrozenPrices(
  input: DeclaredCapacityQuoteInput,
  frozenLines: unknown,
  paidModules: readonly string[],
): DeclaredCapacityStripeQuote | { kind: "contact_sales" } {
  const quote = calculateDeclaredCapacityQuote(input);
  if (quote.kind !== "priced") return { kind: "contact_sales" };
  const parsed = z.array(frozenDeclaredLineSchema).safeParse(frozenLines);
  if (
    !parsed.success ||
    parsed.data.some(
      (line) =>
        !Number.isSafeInteger(line.unitAmountPence * line.quantity) ||
        line.subtotalPence !== line.unitAmountPence * line.quantity,
    )
  ) {
    throw new Error("INVALID_FROZEN_DECLARED_CAPACITY_PRICE");
  }

  const byPriceCode = new Map(
    parsed.data.map((line) => [line.priceCode, line]),
  );
  if (byPriceCode.size !== parsed.data.length) {
    throw new Error("INVALID_FROZEN_DECLARED_CAPACITY_PRICE");
  }

  const lines: Array<
    DeclaredCapacityStripeLine | DeclaredCapacityAddonStripeLine
  > = quote.lines.map((line) => {
    const frozen = byPriceCode.get(line.priceCode);
    if (
      !frozen ||
      frozen.component !== line.component ||
      frozen.unitAmountPence !== line.unitAmountPence
    ) {
      throw new Error("INVALID_FROZEN_DECLARED_CAPACITY_PRICE");
    }
    return {
      ...line,
      priceId: frozen.priceId,
      currency: "GBP",
    };
  });

  const selectedAddons = new Set<string>();
  const validatedPaidModules: DeclaredCapacityAddonModule[] = [];
  for (const module of paidModules) {
    if (!isDeclaredCapacityAddonModule(module)) {
      throw new Error("INVALID_FROZEN_DECLARED_CAPACITY_PRICE");
    }
    const priceCode = declaredCapacityAddonPriceCode(module, input.interval);
    const frozen = byPriceCode.get(priceCode);
    if (
      !frozen ||
      frozen.component !== "ADDON" ||
      frozen.quantity !== 1 ||
      frozen.subtotalPence !== frozen.unitAmountPence ||
      selectedAddons.has(module)
    ) {
      throw new Error("INVALID_FROZEN_DECLARED_CAPACITY_PRICE");
    }
    selectedAddons.add(module);
    validatedPaidModules.push(module);
    lines.push({
      component: "ADDON",
      priceCode,
      priceId: frozen.priceId,
      currency: "GBP",
      quantity: 1,
      unitAmountPence: frozen.unitAmountPence,
      subtotalPence: frozen.unitAmountPence,
    });
  }

  if (
    parsed.data.length !== quote.lines.length + paidModules.length ||
    parsed.data.filter((line) => line.component === "ADDON").length !==
      paidModules.length
  ) {
    throw new Error("INVALID_FROZEN_DECLARED_CAPACITY_PRICE");
  }
  const subtotalPence = lines.reduce(
    (total, line) => total + line.subtotalPence,
    0,
  );
  if (
    parsed.data.reduce((total, line) => total + line.subtotalPence, 0) !==
      subtotalPence ||
    !Number.isSafeInteger(subtotalPence)
  ) {
    throw new Error("INVALID_FROZEN_DECLARED_CAPACITY_PRICE");
  }

  return {
    ...quote,
    planCode: declaredCapacityPlanCode(quote.tier, input.interval),
    lines,
    paidModules: validatedPaidModules,
    trialModules: [],
    subtotalPence,
  };
}

function validateAddonSelection(
  selected: readonly Module[],
  prices: DeclaredCapacityStripeResolvedPrices,
  interval: DeclaredCapacityQuoteInput["interval"],
  requireBothIntervals: boolean,
): DeclaredCapacityAddonModule[] {
  const approvedModules = approvedDeclaredCapacityAddonModules();
  const deliveredModules = deliveredDeclaredCapacityAddonModules();
  const result: DeclaredCapacityAddonModule[] = [];
  for (const module of selected) {
    if (!isDeclaredCapacityAddonModule(module)) {
      throw new Error("INVALID_DECLARED_CAPACITY_ADDON_SELECTION");
    }
    if (!deliveredModules.has(module)) {
      throw new Error("INVALID_DECLARED_CAPACITY_ADDON_SELECTION");
    }
    if (!approvedModules.has(module)) {
      throw new DeclaredCapacityStripePriceError(
        declaredCapacityAddonPriceCode(module, "month"),
      );
    }
    const requiredIntervals = requireBothIntervals
      ? (["month", "year"] as const)
      : ([interval] as const);
    for (const requiredInterval of requiredIntervals) {
      const priceCode = declaredCapacityAddonPriceCode(
        module,
        requiredInterval,
      );
      const price = prices[priceCode];
      if (
        !price ||
        !Number.isSafeInteger(price.unitAmountPence) ||
        price.unitAmountPence <= 0 ||
        !/^price_[A-Za-z0-9]+$/.test(price.priceId)
      ) {
        throw new DeclaredCapacityStripePriceError(priceCode);
      }
    }
    result.push(module);
  }
  return result;
}
