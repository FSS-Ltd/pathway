import { z } from "zod";

export const dashboardDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isCalendarDate, "Date must be a valid YYYY-MM-DD calendar date");

export const aceDashboardQuerySchema = z
  .object({ date: dashboardDateSchema.optional() })
  .strict();

export type AceDashboardQuery = z.infer<typeof aceDashboardQuerySchema>;

export interface AceDashboardResponse {
  localDate: string;
  timezone: string;
  attendance: {
    present: number;
    absent: number;
    late: number;
    unmarked: number;
  };
  pace: {
    ahead: number;
    onTrack: number;
    atRisk: number;
    behind: number;
    blocked: number;
    stale: number;
  };
  behaviour: { siteReview: number; headReview: number };
}

function isCalendarDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
