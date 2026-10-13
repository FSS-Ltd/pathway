import {
  calculateMappedInstitutionalQuote,
  INSTITUTIONAL_MAPPED_PRICE_CODES,
  isMappedInstitutionalPlanCode,
  type InstitutionalMappedPriceCode,
  type InstitutionalMappedQuote,
  type InstitutionalResolvedPrices,
  type InstitutionalStorageChoice,
} from "@pathway/pricing";
import { z } from "zod";

const lineSchema = z.object({
  component: z.enum([
    "BASE",
    "CHILDREN_UP_TO_100",
    "CHILDREN_101_TO_250",
    "STORAGE",
  ]),
  priceCode: z.string(),
  priceId: z.string().regex(/^price_[A-Za-z0-9]+$/),
  currency: z.literal("GBP"),
  quantity: z.number().int().nonnegative().safe(),
  unitAmountPence: z.number().int().positive().safe(),
  subtotalPence: z.number().int().nonnegative().safe(),
});

const priceCodeSet: ReadonlySet<string> = new Set(
  INSTITUTIONAL_MAPPED_PRICE_CODES,
);

function isMappedPriceCode(code: string): code is InstitutionalMappedPriceCode {
  return priceCodeSet.has(code);
}

function storageChoiceFor(code: string): InstitutionalStorageChoice | null {
  if (code.startsWith("STORAGE_100GB_")) return "100";
  if (code.startsWith("STORAGE_200GB_")) return "200";
  if (code.startsWith("STORAGE_1TB_")) return "1000";
  return null;
}

export function quoteFromFrozenInstitutionalPrices(
  snapshot: {
    planCode: string;
    enrolledChildren: number | null;
    subtotalPence: number | null;
    lines?: unknown;
  },
  renewalCount: number,
): InstitutionalMappedQuote {
  const parsed = z.array(lineSchema).safeParse(snapshot.lines);
  if (
    !isMappedInstitutionalPlanCode(snapshot.planCode) ||
    snapshot.enrolledChildren === null ||
    snapshot.subtotalPence === null ||
    !parsed.success
  ) {
    throw new Error("INVALID_FROZEN_INSTITUTIONAL_PRICE");
  }
  const prices: Partial<
    Record<
      InstitutionalMappedPriceCode,
      { priceId: string; unitAmountPence: number }
    >
  > = {};
  let storageChoice: InstitutionalStorageChoice = "none";
  for (const line of parsed.data) {
    if (!isMappedPriceCode(line.priceCode) || prices[line.priceCode]) {
      throw new Error("INVALID_FROZEN_INSTITUTIONAL_PRICE");
    }
    prices[line.priceCode] = {
      priceId: line.priceId,
      unitAmountPence: line.unitAmountPence,
    };
    if (line.component === "STORAGE") {
      const selected = storageChoiceFor(line.priceCode);
      if (!selected || storageChoice !== "none") {
        throw new Error("INVALID_FROZEN_INSTITUTIONAL_PRICE");
      }
      storageChoice = selected;
    }
  }
  const resolved: InstitutionalResolvedPrices = prices;
  const original = calculateMappedInstitutionalQuote({
    planCode: snapshot.planCode,
    enrolledChildren: snapshot.enrolledChildren,
    storageChoice,
    prices: resolved,
  });
  if (
    original.kind !== "priced" ||
    original.subtotalPence !== snapshot.subtotalPence ||
    original.lines.length !== parsed.data.length ||
    original.lines.some((line, index) => {
      const accepted = parsed.data[index];
      return (
        line.component !== accepted.component ||
        line.priceCode !== accepted.priceCode ||
        line.priceId !== accepted.priceId ||
        line.currency !== accepted.currency ||
        line.quantity !== accepted.quantity ||
        line.unitAmountPence !== accepted.unitAmountPence ||
        line.subtotalPence !== accepted.subtotalPence
      );
    })
  ) {
    throw new Error("INVALID_FROZEN_INSTITUTIONAL_PRICE");
  }
  return calculateMappedInstitutionalQuote({
    planCode: snapshot.planCode,
    enrolledChildren: renewalCount,
    storageChoice,
    prices: resolved,
  });
}
