import { z } from "zod";

export const advancePaceInventoryOrderSchema = z
  .object({ status: z.enum(["IN_TRANSIT", "DELIVERED"]) })
  .strict();

export type AdvancePaceInventoryOrderDto = z.infer<
  typeof advancePaceInventoryOrderSchema
>;
