/**
 * Date.prototype.toISOString() converts to UTC first, which rolls the calendar
 * date back a day whenever the local timezone is ahead of UTC (e.g. BST).
 * Use this instead of `date.toISOString().slice(0, 10)` whenever a "YYYY-MM-DD"
 * string should represent the date as seen in the browser's local timezone
 * (week ranges, rota/calendar grouping, date-input defaults).
 */
export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
