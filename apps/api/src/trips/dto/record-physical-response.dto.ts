import { z } from "zod";
import { tripSlipIdSchema } from "../trip-slip.dto";

export const recordPhysicalResponseSchema = z
  .object({
    childId: tripSlipIdSchema,
    expectedVersionId: tripSlipIdSchema,
    expectedVersionHash: z.string().regex(/^[a-f0-9]{64}$/),
    decision: z.enum(["ACCEPTED", "DECLINED"]),
    source: z.enum(["PHYSICAL", "TELEPHONE"]),
    reason: z.string().trim().min(1).max(2000),
    witnessUserId: tripSlipIdSchema,
  })
  .strict();

export type RecordPhysicalResponseInput = z.infer<
  typeof recordPhysicalResponseSchema
>;
