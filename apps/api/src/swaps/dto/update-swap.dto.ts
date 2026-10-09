import { z } from "zod";
import { SwapStatus } from "@pathway/db";

export const updateSwapDto = z
  .object({
    toUserId: z.string().uuid().optional(),
    status: z.nativeEnum(SwapStatus).optional(),
  })
  .refine(
    (value) => value.toUserId !== undefined || value.status !== undefined,
    {
      message: "A swap change is required",
    },
  );

export type UpdateSwapDto = z.infer<typeof updateSwapDto>;
