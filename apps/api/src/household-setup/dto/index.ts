import { z } from "zod";

export const learningDaysSchema = z
  .object({
    days: z.array(z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])).max(7),
  })
  .strict();

export type LearningDaysDto = z.infer<typeof learningDaysSchema>;

export * from "./preferences.dto";
