import { z } from "zod";

export const createStaffDirectConversationSchema = z
  .object({
    kind: z.literal("STAFF_DIRECT"),
    recipientUserId: z.string().uuid(),
  })
  .strict();

export type CreateStaffDirectConversationInput = z.infer<
  typeof createStaffDirectConversationSchema
>;
