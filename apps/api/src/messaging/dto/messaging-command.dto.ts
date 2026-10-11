import { z } from "zod";
import { composeMessageSchema } from "@pathway/platform";

export const createStaffDirectConversationSchema = z
  .object({
    kind: z.literal("STAFF_DIRECT"),
    recipientUserId: z.string().uuid(),
  })
  .strict();

export type CreateStaffDirectConversationInput = z.infer<
  typeof createStaffDirectConversationSchema
>;

export const createParentConversationSchema = z
  .object({ recipientUserId: z.string().uuid() })
  .strict();

export type CreateParentConversationInput = z.infer<
  typeof createParentConversationSchema
>;

export const createStaffRoomConversationSchema = z
  .object({ kind: z.literal("STAFF_ROOM") })
  .strict();

export const createStaffConversationSchema = z.discriminatedUnion("kind", [
  createStaffDirectConversationSchema,
  createStaffRoomConversationSchema,
]);

export const sendMessageSchema = composeMessageSchema;

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
