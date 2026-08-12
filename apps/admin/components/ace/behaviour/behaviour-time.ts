type LocalDateTime = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function toSiteDateTimeInput(value: string, timeZone: string): string {
  if (LOCAL_DATE_TIME.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const parts = dateTimeParts(date, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function siteDateTimeToIso(
  value: string,
  timeZone: string,
): string | null {
  const target = parseLocalDateTime(value);
  if (!target) return null;

  const wallClockUtc = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute,
  );
  const offsets = new Set(
    [-86_400_000, 0, 86_400_000].map((delta) =>
      timeZoneOffset(new Date(wallClockUtc + delta), timeZone),
    ),
  );
  const matches = [...offsets]
    .map((offset) => new Date(wallClockUtc - offset))
    .filter((candidate) =>
      sameLocalDateTime(dateTimeParts(candidate, timeZone), target),
    )
    .sort((left, right) => left.getTime() - right.getTime());

  return matches[0]?.toISOString() ?? null;
}

export function formatSiteDateTime(value: string, timeZone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || !isValidIanaTimeZone(timeZone)) {
    return value;
  }
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(date);
}

export function isValidIanaTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

function parseLocalDateTime(value: string): LocalDateTime | null {
  const match = LOCAL_DATE_TIME.exec(value);
  if (!match) return null;
  const parsed = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
  const check = new Date(
    Date.UTC(
      parsed.year,
      parsed.month - 1,
      parsed.day,
      parsed.hour,
      parsed.minute,
    ),
  );
  return check.getUTCFullYear() === parsed.year &&
    check.getUTCMonth() + 1 === parsed.month &&
    check.getUTCDate() === parsed.day &&
    check.getUTCHours() === parsed.hour &&
    check.getUTCMinutes() === parsed.minute
    ? parsed
    : null;
}

function dateTimeParts(date: Date, timeZone: string): LocalDateTime {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
  };
}

function timeZoneOffset(date: Date, timeZone: string): number {
  const parts = dateTimeParts(date, timeZone);
  const representedUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
  );
  return representedUtc - Math.floor(date.getTime() / 60_000) * 60_000;
}

function sameLocalDateTime(left: LocalDateTime, right: LocalDateTime): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute
  );
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
