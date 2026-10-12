import { z } from "zod";
import { SwapStatus } from "@pathway/db";

export const updateSwapDto = z.object({
  toUserId: z.string().uuid().optional(),
  status: z.nativeEnum(SwapStatus).optional(),
});

export type UpdateSwapDto = z.infer<typeof updateSwapDto>;
