import { z } from "zod";
import { Weekday } from "@pathway/db";

const weekdaySchema = z.nativeEnum(Weekday);
const timeSchema = z
  .string()
  .regex(/^\d{2}:\d{2}$/, "Time must be HH:mm")
  .refine(
    (s) => {
      const [h, m] = s.split(":").map(Number);
      return h >= 0 && h <= 23 && m >= 0 && m <= 59;
    },
    { message: "Time must be valid HH:mm" },
  );

const weeklyAvailabilityItemSchema = z
  .object({
    day: weekdaySchema,
    startTime: timeSchema,
    endTime: timeSchema,
  })
  .refine((v) => v.startTime < v.endTime, {
    message: "startTime must be before endTime",
    path: ["endTime"],
  });

const unavailableDateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  reason: z.string().max(500).optional(),
});

export const updateStaffDto = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD").optional().nullable(),
  hasServeAccess: z.boolean().optional(),
  role: z.enum(["SITE_ADMIN", "STAFF", "VIEWER"]).optional(),
  isActive: z.boolean().optional(),
  weeklyAvailability: z.array(weeklyAvailabilityItemSchema).optional(),
  unavailableDates: z.array(unavailableDateSchema).optional(),
  preferredGroupIds: z.array(z.string().uuid()).optional(),
});

export type UpdateStaffDto = z.infer<typeof updateStaffDto>;
