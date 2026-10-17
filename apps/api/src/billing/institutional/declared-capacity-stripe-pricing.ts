import {
  calculateDeclaredCapacityQuote,
  declaredCapacityPlanCode,
  type InstitutionalStorageChoice,
  type InstitutionalMappedPriceCode,
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
type DeclaredCapacityStoragePriceCode = Extract<
  InstitutionalMappedPriceCode,
  `STORAGE_${string}`
>;
type DeclaredCapacityStorageStripeLine = Readonly<{
  component: "STORAGE";
  priceCode: DeclaredCapacityStoragePriceCode;
  priceId: string;
  currency: "GBP";
  quantity: 1;
  unitAmountPence: number;
  subtotalPence: number;
}>;
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
  storageChoice: InstitutionalStorageChoice;
  currency: "GBP";
  siteAllowance: number;
  trialModuleSlots: number;
  includedPaidModules: readonly never[];
  lines: readonly (
    | DeclaredCapacityStripeLine
    | DeclaredCapacityStorageStripeLine
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
        DeclaredCapacityAddonPriceCode | InstitutionalMappedPriceCode,
        { priceId: string; unitAmountPence: number }
      >
    >;

const storagePriceCodes = {
  "100": { month: "STORAGE_100GB_MONTHLY", year: "STORAGE_100GB_YEARLY" },
  "200": { month: "STORAGE_200GB_MONTHLY", year: "STORAGE_200GB_YEARLY" },
  "1000": { month: "STORAGE_1TB_MONTHLY", year: "STORAGE_1TB_YEARLY" },
} as const satisfies Record<
  Exclude<InstitutionalStorageChoice, "none">,
  Record<"month" | "year", DeclaredCapacityStoragePriceCode>
>;

export function declaredCapacityStoragePriceCode(
  choice: InstitutionalStorageChoice,
  interval: "month" | "year",
): DeclaredCapacityStoragePriceCode | null {
  return choice === "none" ? null : storagePriceCodes[choice][interval];
}

export function declaredCapacityStorageGb(
  choice: InstitutionalStorageChoice,
): number | null {
  return choice === "none" ? null : Number(choice);
}

export function declaredCapacityStorageOptions(
  prices: DeclaredCapacityStripeResolvedPrices,
) {
  const priceFor = (
    choice: InstitutionalStorageChoice,
    interval: "month" | "year",
  ): number | null => {
    const priceCode = declaredCapacityStoragePriceCode(choice, interval);
    return priceCode === null
      ? 0
      : (prices[priceCode]?.unitAmountPence ?? null);
  };
  return (["none", "100", "200", "1000"] as const).map((choice) => ({
    choice,
    monthlyPricePence: priceFor(choice, "month"),
    yearlyPricePence: priceFor(choice, "year"),
  }));
}

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
      | DeclaredCapacityAddonPriceCode
      | DeclaredCapacityStoragePriceCode,
  ) {
    super(`MISSING_OR_INVALID_DECLARED_CAPACITY_PRICE:${priceCode}`);
    this.name = "DeclaredCapacityStripePriceError";
  }
}

const frozenDeclaredLineSchema = z.object({
  component: z.enum(["BASE", "DECLARED_CAPACITY", "ADDON", "STORAGE"]),
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
    storageChoice?: InstitutionalStorageChoice;
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
  const storageChoice = selections.storageChoice ?? "none";
  const allSelected = [...paidModules, ...trialModules];
  if (
    new Set(allSelected).size !== allSelected.length ||
    trialModules.length > quote.trialModuleSlots
  ) {
    throw new Error("INVALID_DECLARED_CAPACITY_ADDON_SELECTION");
  }

  const lines: Array<
    | DeclaredCapacityStripeLine
    | DeclaredCapacityStorageStripeLine
    | DeclaredCapacityAddonStripeLine
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
  const selectedPriceIds = new Set(lines.map((line) => line.priceId));
  if (selectedPriceIds.size !== lines.length) {
    const duplicate = lines.find(
      (line, index, all) =>
        all.findIndex((candidate) => candidate.priceId === line.priceId) !==
        index,
    );
    throw new DeclaredCapacityStripePriceError(
      duplicate?.priceCode ?? "DECLARED_CAPACITY_BASE_MONTHLY",
    );
  }

  const storagePriceCode = declaredCapacityStoragePriceCode(
    storageChoice,
    input.interval,
  );
  if (storagePriceCode) {
    const price = prices[storagePriceCode];
    if (
      !price ||
      !Number.isSafeInteger(price.unitAmountPence) ||
      price.unitAmountPence <= 0 ||
      !/^price_[A-Za-z0-9]+$/.test(price.priceId)
    ) {
      throw new DeclaredCapacityStripePriceError(storagePriceCode);
    }
    if (selectedPriceIds.has(price.priceId)) {
      throw new DeclaredCapacityStripePriceError(storagePriceCode);
    }
    selectedPriceIds.add(price.priceId);
    lines.push({
      component: "STORAGE",
      priceCode: storagePriceCode,
      priceId: price.priceId,
      currency: "GBP",
      quantity: 1,
      unitAmountPence: price.unitAmountPence,
      subtotalPence: price.unitAmountPence,
    });
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
    storageChoice,
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
    | DeclaredCapacityStripeLine
    | DeclaredCapacityStorageStripeLine
    | DeclaredCapacityAddonStripeLine
  > = quote.lines.map((line) => {
    const frozen = byPriceCode.get(line.priceCode);
    if (
      !frozen ||
      frozen.component !== line.component ||
      frozen.quantity !== line.quantity ||
      frozen.subtotalPence !== line.subtotalPence ||
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

  const frozenStorage = parsed.data.filter(
    (line) => line.component === "STORAGE",
  );
  if (frozenStorage.length > 1) {
    throw new Error("INVALID_FROZEN_DECLARED_CAPACITY_PRICE");
  }
  let storageChoice: InstitutionalStorageChoice = "none";
  if (frozenStorage.length === 1) {
    const frozen = frozenStorage[0];
    const selected = (
      Object.keys(storagePriceCodes) as Array<
        Exclude<InstitutionalStorageChoice, "none">
      >
    ).find(
      (choice) =>
        storagePriceCodes[choice][input.interval] === frozen.priceCode,
    );
    if (
      !selected ||
      frozen.quantity !== 1 ||
      frozen.subtotalPence !== frozen.unitAmountPence
    ) {
      throw new Error("INVALID_FROZEN_DECLARED_CAPACITY_PRICE");
    }
    storageChoice = selected;
    const priceCode = declaredCapacityStoragePriceCode(
      storageChoice,
      input.interval,
    );
    if (!priceCode) {
      throw new Error("INVALID_FROZEN_DECLARED_CAPACITY_PRICE");
    }
    lines.push({
      component: "STORAGE",
      priceCode,
      priceId: frozen.priceId,
      currency: "GBP",
      quantity: 1,
      unitAmountPence: frozen.unitAmountPence,
      subtotalPence: frozen.unitAmountPence,
    });
  }

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
    parsed.data.length !==
      quote.lines.length + paidModules.length + frozenStorage.length ||
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
    storageChoice,
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
