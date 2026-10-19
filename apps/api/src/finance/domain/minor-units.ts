const MIN_POSTGRES_BIGINT = -(1n << 63n);
const MAX_POSTGRES_BIGINT = (1n << 63n) - 1n;
const INTEGER_STRING = /^-?(?:0|[1-9]\d*)$/;

/** Parse an exact amount in currency minor units (for example, cents). */
export function parseMinorUnits(value: unknown): bigint {
  let amount: bigint;

  if (typeof value === "bigint") {
    amount = value;
  } else if (typeof value === "number" && Number.isSafeInteger(value)) {
    amount = BigInt(value);
  } else if (typeof value === "string" && INTEGER_STRING.test(value)) {
    amount = BigInt(value);
  } else {
    throw new RangeError(
      "Amount must be an exact integer number of minor units",
    );
  }

  assertPostgresBigintRange(amount);
  return amount;
}

/** Add integer minor-unit amounts without exceeding PostgreSQL BIGINT. */
export function addMinorUnits(left: bigint, right: bigint): bigint {
  assertPostgresBigintRange(left);
  assertPostgresBigintRange(right);
  const total = left + right;
  assertPostgresBigintRange(total);
  return total;
}

function assertPostgresBigintRange(amount: bigint): void {
  if (amount < MIN_POSTGRES_BIGINT || amount > MAX_POSTGRES_BIGINT) {
    throw new RangeError("Amount is outside the supported integer range");
  }
}
