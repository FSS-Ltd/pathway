import { z } from "zod";
import { SessionRotaKind } from "@pathway/db";

export const updateSessionSchema = z.object({
  tenantId: z.string().optional(),
  groupId: z.string().uuid().nullable().optional(), // deprecated: use groupIds
  groupIds: z.array(z.string().uuid()).nullable().optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
  title: z.string().optional(),
  rotaKind: z.nativeEnum(SessionRotaKind).optional(),
});

export type UpdateSessionDto = z.infer<typeof updateSessionSchema>;
