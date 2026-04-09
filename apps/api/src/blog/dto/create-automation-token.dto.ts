import { z } from "zod";

export const createAutomationTokenDto = z.object({
  name: z.string().min(1).max(120),
  expiresAt: z.coerce.date().optional().nullable(),
});

export type CreateAutomationTokenDto = z.infer<typeof createAutomationTokenDto>;
