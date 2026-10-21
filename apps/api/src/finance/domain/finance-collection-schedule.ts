const MAX_INSTALLMENTS = 12;
const BANK_CALENDAR_START = "2026-01-01";
const BANK_CALENDAR_END = "2028-12-31";

// Snapshot of GOV.UK bank holidays for England and Wales, Scotland, and
// Northern Ireland, reviewed 21 October 2026. The union is deliberately
// conservative for GB schools. Refresh before coverage expires.
// Source: https://www.gov.uk/bank-holidays
const UK_BANK_HOLIDAYS = new Set([
  "2026-01-01",
  "2026-01-02",
  "2026-01-01",
  "2026-03-17",
  "2026-04-03",
  "2026-04-06",
  "2026-05-04",
  "2026-05-25",
  "2026-06-15",
  "2026-07-13",
  "2026-08-03",
  "2026-08-31",
  "2026-08-31",
  "2026-11-30",
  "2026-12-25",
  "2026-12-28",
  "2027-01-01",
  "2027-01-04",
  "2027-03-17",
  "2027-03-26",
  "2027-03-29",
  "2027-05-03",
  "2027-05-31",
  "2027-07-12",
  "2027-08-02",
  "2027-08-30",
  "2027-11-30",
  "2027-12-27",
  "2027-12-28",
  "2028-01-03",
  "2028-01-04",
  "2028-03-17",
  "2028-03-17",
  "2028-04-14",
  "2028-04-17",
  "2028-05-01",
  "2028-05-29",
  "2028-07-12",
  "2028-08-07",
  "2028-08-28",
  "2028-08-28",
  "2028-11-30",
  "2028-12-25",
  "2028-12-26",
]);

export interface FinanceCollectionInstalmentDraft {
  sequence: number;
  amountMinor: bigint;
  dueAt: Date;
}

export function splitFinanceInvoiceAmount(
  totalMinor: bigint,
  count: number,
): bigint[] {
  if (totalMinor <= 0n) {
    throw new Error("Finance instalment total must be positive");
  }
  if (!Number.isInteger(count) || count < 1 || count > MAX_INSTALLMENTS) {
    throw new Error("Finance instalment count must be between 1 and 12");
  }
  if (totalMinor < BigInt(count)) {
    throw new Error("Finance instalments must each be at least one penny");
  }

  const baseAmount = totalMinor / BigInt(count);
  const remainder = totalMinor % BigInt(count);
  return Array.from({ length: count }, (_, index) =>
    index === count - 1 ? baseAmount + remainder : baseAmount,
  );
}

export function buildFinanceCollectionInstalments(
  totalMinor: bigint,
  count: number,
  firstDueDate: string,
): FinanceCollectionInstalmentDraft[] {
  const amounts = splitFinanceInvoiceAmount(totalMinor, count);
  const anchor = parseDateOnly(firstDueDate);
  const anchorDay = anchor.getUTCDate();

  return amounts.map((amountMinor, index) => ({
    sequence: index + 1,
    amountMinor,
    dueAt: nextUkBusinessDate(dateForMonth(anchor, anchorDay, index)),
  }));
}

function parseDateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Finance collection date must use YYYY-MM-DD");
  }
  assertCalendarCoverage(value);
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("Finance collection date is invalid");
  }
  return parsed;
}

function dateForMonth(
  anchor: Date,
  anchorDay: number,
  monthOffset: number,
): Date {
  const absoluteMonth =
    anchor.getUTCFullYear() * 12 + anchor.getUTCMonth() + monthOffset;
  const year = Math.floor(absoluteMonth / 12);
  const month = absoluteMonth % 12;
  const finalDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const candidate = new Date(
    Date.UTC(year, month, Math.min(anchorDay, finalDay)),
  );
  assertCalendarCoverage(candidate.toISOString().slice(0, 10));
  return candidate;
}

function nextUkBusinessDate(date: Date): Date {
  const candidate = new Date(date);
  while (true) {
    const dateOnly = candidate.toISOString().slice(0, 10);
    assertCalendarCoverage(dateOnly);
    const dayOfWeek = candidate.getUTCDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !UK_BANK_HOLIDAYS.has(dateOnly)) {
      return candidate;
    }
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }
}

function assertCalendarCoverage(dateOnly: string): void {
  if (dateOnly < BANK_CALENDAR_START || dateOnly > BANK_CALENDAR_END) {
    throw new Error(
      "Finance business calendar does not cover this collection date",
    );
  }
}
