import { z } from "zod";

const limit = z
  .string()
  .regex(/^(?:[1-9]|[1-4]\d|50)$/)
  .transform(Number)
  .optional();
const cursor = z.string().min(1).max(512).optional();

export const paceInventoryOrdersQuerySchema = z
  .object({
    limit,
    cursor,
    childId: z.string().uuid().optional(),
    status: z.enum(["ORDERED", "IN_TRANSIT", "DELIVERED"]).optional(),
  })
  .strict();

export const paceInventoryStockQuerySchema = z
  .object({
    limit,
    cursor,
    attentionOnly: z.enum(["true"]).optional(),
  })
  .strict();

export type PaceInventoryOrdersQuery = z.infer<
  typeof paceInventoryOrdersQuerySchema
>;
export type PaceInventoryStockQuery = z.infer<
  typeof paceInventoryStockQuerySchema
>;
