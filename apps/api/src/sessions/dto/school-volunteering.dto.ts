import { BadRequestException } from "@nestjs/common";
import { z } from "zod";
import { isDateOnly } from "../../ace-settings/dto/academic-calendar.dto";

const dateKey = z.string().refine(isDateOnly, "Use a valid YYYY-MM-DD date");

export const saveSchoolVolunteeringSchema = z
  .object({
    dates: z.array(dateKey).max(366),
  })
  .strict()
  .refine(({ dates }) => new Set(dates).size === dates.length, {
    path: ["dates"],
    message: "Choose each date once",
  });

export const staffVolunteeringRangeSchema = z
  .object({
    from: dateKey,
    to: dateKey,
  })
  .strict()
  .refine(({ from, to }) => from <= to, {
    path: ["to"],
    message: "End date must follow start date",
  })
  .refine(
    ({ from, to }) =>
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
        86_400_000 <=
      31,
    { path: ["to"], message: "Select at most 32 days" },
  );

export function parseVolunteeringInput<T>(
  schema: z.ZodType<T>,
  value: unknown,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
  return parsed.data;
}

export type SaveSchoolVolunteering = z.infer<
  typeof saveSchoolVolunteeringSchema
>;
export type StaffVolunteeringRange = z.infer<
  typeof staffVolunteeringRangeSchema
>;
