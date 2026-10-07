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

export const sendStaffMessageSchema = z
  .object({
    clientRequestId: z.string().uuid(),
    body: z.string().trim().min(1).max(4000),
  })
  .strict();

export type SendStaffMessageInput = z.infer<typeof sendStaffMessageSchema>;
