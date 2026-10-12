import { BadRequestException } from "@nestjs/common";

export const CENSUS_NOTICE_MS = 7 * 24 * 60 * 60 * 1_000;
export const QUOTE_VALIDITY_MS = 15 * 60 * 1_000;

export function assertTimezone(timezone: string): string {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone });
    return timezone;
  } catch {
    throw new BadRequestException({
      code: "INVALID_TIMEZONE",
      message: "A valid organisation timezone is required.",
    });
  }
}

export function localDateAt(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: assertTimezone(timezone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function censusCutoffFor(periodStart: Date): Date {
  if (Number.isNaN(periodStart.getTime())) {
    throw new BadRequestException("Invalid renewal date.");
  }
  return new Date(periodStart.getTime() - CENSUS_NOTICE_MS);
}
