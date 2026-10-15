import { addMinorUnits, parseMinorUnits } from "./minor-units";

export interface FinanceLineInput {
  description: string;
  quantity: string;
  unitAmountMinor: string;
  taxRateBasisPoints: number;
}

export interface CalculatedFinanceLine extends FinanceLineInput {
  netAmountMinor: bigint;
  taxAmountMinor: bigint;
  totalMinor: bigint;
}

export interface FinanceTotals {
  subtotalMinor: bigint;
  taxMinor: bigint;
  totalMinor: bigint;
}

const QUANTITY_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/;
const MAX_QUANTITY_MILLIUNITS = 999_999_999_999n;
const MAX_TAX_RATE_BASIS_POINTS = 100_000;

export function calculateFinanceLine(
  input: FinanceLineInput,
): CalculatedFinanceLine {
  const quantityMilliunits = parseQuantity(input.quantity);
  const unitAmountMinor = parseMinorUnits(input.unitAmountMinor);
  const taxRate = input.taxRateBasisPoints;

  if (unitAmountMinor < 0n) {
    throw new RangeError("Unit amount must not be negative");
  }
  if (
    !Number.isInteger(taxRate) ||
    taxRate < 0 ||
    taxRate > MAX_TAX_RATE_BASIS_POINTS
  ) {
    throw new RangeError("Tax rate is outside the supported range");
  }

  const netAmountMinor = roundHalfUp(
    quantityMilliunits * unitAmountMinor,
    1000n,
  );
  const taxAmountMinor = roundHalfUp(netAmountMinor * BigInt(taxRate), 10_000n);
  const totalMinor = addMinorUnits(netAmountMinor, taxAmountMinor);

  return {
    description: input.description,
    quantity: input.quantity,
    unitAmountMinor: unitAmountMinor.toString(),
    taxRateBasisPoints: taxRate,
    netAmountMinor,
    taxAmountMinor,
    totalMinor,
  };
}

export function calculateFinanceTotals(
  lines: readonly FinanceLineInput[],
): FinanceTotals {
  return calculateFinanceDocument(lines).totals;
}

export function calculateFinanceDocument(lines: readonly FinanceLineInput[]): {
  lines: CalculatedFinanceLine[];
  totals: FinanceTotals;
} {
  if (lines.length === 0) {
    throw new RangeError("At least one invoice line is required");
  }

  const calculatedLines: CalculatedFinanceLine[] = [];
  let subtotalMinor = 0n;
  let taxMinor = 0n;
  let totalMinor = 0n;

  for (const input of lines) {
    const line = calculateFinanceLine(input);
    calculatedLines.push(line);
    subtotalMinor = addMinorUnits(subtotalMinor, line.netAmountMinor);
    taxMinor = addMinorUnits(taxMinor, line.taxAmountMinor);
    totalMinor = addMinorUnits(totalMinor, line.totalMinor);
  }

  return {
    lines: calculatedLines,
    totals: { subtotalMinor, taxMinor, totalMinor },
  };
}

export function quantityMilliunits(quantity: string): bigint {
  return parseQuantity(quantity);
}

function parseQuantity(value: string): bigint {
  if (!QUANTITY_PATTERN.test(value)) {
    throw new RangeError("Quantity must use at most three decimal places");
  }

  const [whole, fraction = ""] = value.split(".");
  const milliunits = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0"));
  if (milliunits <= 0n || milliunits > MAX_QUANTITY_MILLIUNITS) {
    throw new RangeError("Quantity is outside the supported range");
  }
  return milliunits;
}

function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return parseMinorUnits(rounded);
}
