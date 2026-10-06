export interface PaceNumber {
  raw: number;
  level: number;
  sequence: number;
}

const PACES_PER_LEVEL = 12;
const SHORT_PACE_START = 1;
const SHORT_PACE_END = 144;
const LONG_PACE_START = 1001;
const LONG_PACE_END = 1144;

export function parsePaceNumber(raw: number): PaceNumber {
  const offset = toPaceOffset(raw);

  return {
    raw,
    level: Math.floor(offset / PACES_PER_LEVEL) + 1,
    sequence: (offset % PACES_PER_LEVEL) + 1,
  };
}

export function toCataloguePaceNumber(raw: number): number {
  parsePaceNumber(raw);
  return raw <= SHORT_PACE_END ? raw + 1000 : raw;
}

export function comparePaceNumbers(a: PaceNumber, b: PaceNumber): number {
  const left = parsePaceNumber(a.raw);
  const right = parsePaceNumber(b.raw);

  return (
    Math.sign(left.level - right.level) ||
    Math.sign(left.sequence - right.sequence)
  );
}

export function nextPaceNumber(current: PaceNumber): PaceNumber {
  return parsePaceNumber(current.raw + 1);
}

function toPaceOffset(raw: number): number {
  if (!Number.isInteger(raw)) {
    throw new RangeError("PACE number must be an integer.");
  }

  if (raw >= SHORT_PACE_START && raw <= SHORT_PACE_END) {
    return raw - SHORT_PACE_START;
  }

  if (raw >= LONG_PACE_START && raw <= LONG_PACE_END) {
    return raw - LONG_PACE_START;
  }

  throw new RangeError(
    "PACE number must be between 1 and 144 or between 1001 and 1144.",
  );
}
