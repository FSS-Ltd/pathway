import { z } from "zod";

export const createPaceInventoryOrdersSchema = z
  .object({
    childId: z.string().uuid(),
    subjectId: z.string().uuid(),
    paceNumbers: z
      .array(z.number().int().min(1001).max(1144))
      .min(1)
      .max(24)
      .refine((numbers) => new Set(numbers).size === numbers.length, {
        message: "PACE numbers must be distinct",
      }),
  })
  .strict();

export type CreatePaceInventoryOrdersDto = z.infer<
  typeof createPaceInventoryOrdersSchema
>;
