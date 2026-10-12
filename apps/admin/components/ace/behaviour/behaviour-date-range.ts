import { siteDateTimeToIso } from "./behaviour-time";

export function siteDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const value = (type: "year" | "month" | "day") =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function daysBefore(date: string, days: number): string {
  const instant = new Date(`${date}T00:00:00.000Z`);
  instant.setUTCDate(instant.getUTCDate() - days);
  return instant.toISOString().slice(0, 10);
}

export function historyDateBounds(
  from: string,
  to: string,
  timeZone: string,
): { occurredFrom?: string; occurredTo?: string } | null {
  if (from && to && from > to) return null;
  const occurredFrom = from
    ? siteDateTimeToIso(`${from}T00:00`, timeZone)
    : undefined;
  const dayAfterTo = to ? daysBefore(to, -1) : undefined;
  const nextMidnight = dayAfterTo
    ? siteDateTimeToIso(`${dayAfterTo}T00:00`, timeZone)
    : undefined;
  if ((from && !occurredFrom) || (to && !nextMidnight)) return null;
  return {
    ...(occurredFrom ? { occurredFrom } : {}),
    ...(nextMidnight
      ? {
          occurredTo: new Date(
            new Date(nextMidnight).getTime() - 1,
          ).toISOString(),
        }
      : {}),
  };
}
