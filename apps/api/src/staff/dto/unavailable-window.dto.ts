import { z } from "zod";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  }, "Date must be a real calendar date");

export const unavailableWindowSchema = z
  .object({
    date: dateSchema,
    startMinute: z.number().int().min(0).max(1439).default(0),
    endMinute: z.number().int().min(1).max(1440).default(1440),
    reason: z.string().max(500).nullish(),
  })
  .refine((window) => window.startMinute < window.endMinute, {
    message: "Start time must be before end time",
    path: ["endMinute"],
  });
