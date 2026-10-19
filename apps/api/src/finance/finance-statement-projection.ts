import { addMinorUnits, parseMinorUnits } from "./domain/minor-units";

export interface FinanceStatementTotalsInput {
  openingBalanceMinor: bigint;
  chargesIssuedMinor: bigint;
  creditsIssuedMinor: bigint;
  allocatedReceiptsMinor: bigint;
  reversalsMinor: bigint;
  unappliedFundsMinor: bigint;
  processingFundsMinor: bigint;
}

export interface FinanceStatementTotals {
  openingBalanceMinor: string;
  chargesIssuedMinor: string;
  creditsIssuedMinor: string;
  allocatedReceiptsMinor: string;
  reversalsMinor: string;
  closingBalanceMinor: string;
  unappliedFundsMinor: string;
  processingFundsMinor: string;
}

/** Totals use integer minor units; unapplied funds are reported outside debt. */
export function buildFinanceStatementTotals(
  input: FinanceStatementTotalsInput,
): FinanceStatementTotals {
  const opening = parseMinorUnits(input.openingBalanceMinor);
  const charges = nonNegative(input.chargesIssuedMinor);
  const credits = nonNegative(input.creditsIssuedMinor);
  const allocations = nonNegative(input.allocatedReceiptsMinor);
  const reversals = parseMinorUnits(input.reversalsMinor);
  const unapplied = nonNegative(input.unappliedFundsMinor);
  const processing = nonNegative(input.processingFundsMinor);
  const closing = addMinorUnits(
    addMinorUnits(
      addMinorUnits(addMinorUnits(opening, charges), -credits),
      -allocations,
    ),
    reversals,
  );

  return {
    openingBalanceMinor: opening.toString(),
    chargesIssuedMinor: charges.toString(),
    creditsIssuedMinor: credits.toString(),
    allocatedReceiptsMinor: allocations.toString(),
    reversalsMinor: reversals.toString(),
    closingBalanceMinor: closing.toString(),
    unappliedFundsMinor: unapplied.toString(),
    processingFundsMinor: processing.toString(),
  };
}

function nonNegative(amount: bigint): bigint {
  const parsed = parseMinorUnits(amount);
  if (parsed < 0n) {
    throw new RangeError("Statement movements cannot be negative");
  }
  return parsed;
}
