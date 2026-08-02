const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type DayOption = { label: string; date: Date };

/**
 * Today, Tomorrow, then the next weekdays by name - chips, not a native date
 * picker. Matches the chip-based date/time selection the approved wireframe
 * already uses on the adjacent first-activity setup screen, and avoids a new
 * native dependency with inconsistent react-native-web support.
 */
export function upcomingDayOptions(count = 6, from = new Date()): DayOption[] {
  const options: DayOption[] = [];
  for (let i = 0; i < count; i += 1) {
    const date = new Date(from);
    date.setDate(date.getDate() + i);
    date.setHours(0, 0, 0, 0);
    const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : WEEKDAY_LABELS[date.getDay()];
    options.push({ label, date });
  }
  return options;
}

export type TimeOption = { label: string; hour: number; minute: number };

export const TIME_OPTIONS: TimeOption[] = [
  { label: "09:00", hour: 9, minute: 0 },
  { label: "10:00", hour: 10, minute: 0 },
  { label: "11:00", hour: 11, minute: 0 },
  { label: "14:00", hour: 14, minute: 0 },
  { label: "16:00", hour: 16, minute: 0 },
];

export type DurationOption = { label: string; minutes: number };

export const DURATION_OPTIONS: DurationOption[] = [
  { label: "15 min", minutes: 15 },
  { label: "30 min", minutes: 30 },
  { label: "45 min", minutes: 45 },
  { label: "60 min", minutes: 60 },
];

export function combineDateAndTime(date: Date, time: TimeOption): Date {
  const combined = new Date(date);
  combined.setHours(time.hour, time.minute, 0, 0);
  return combined;
}

export function formatDayLabel(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const compareDate = new Date(date);
  compareDate.setHours(0, 0, 0, 0);
  const diffDays = Math.round((compareDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  return WEEKDAY_LABELS[date.getDay()];
}

export function formatTimeLabel(date: Date): string {
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
