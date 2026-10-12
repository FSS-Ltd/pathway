import { z } from "zod";

export const createSessionSchema = z.object({
  tenantId: z.string().uuid(),
  groupId: z.string().uuid().optional(), // deprecated: use groupIds
  groupIds: z.array(z.string().uuid()).optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  title: z.string().optional(),
});

export type CreateSessionDto = z.infer<typeof createSessionSchema>;
