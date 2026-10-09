import { z } from "zod";

const dateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  }, "Enter a valid date");

export const teamScheduleQueryDto = z
  .object({ dateFrom: dateKey, dateTo: dateKey })
  .refine(
    ({ dateFrom, dateTo }) => {
      const days =
        (Date.parse(`${dateTo}T00:00:00.000Z`) -
          Date.parse(`${dateFrom}T00:00:00.000Z`)) /
        86_400_000;
      return days >= 0 && days <= 6;
    },
    { message: "Select one to seven days", path: ["dateTo"] },
  );

export type TeamScheduleQueryDto = z.infer<typeof teamScheduleQueryDto>;
