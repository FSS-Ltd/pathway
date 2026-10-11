import { z } from "zod";
import { CONVERSATION_KINDS } from "./recipient-policy";

const idSchema = z.string().uuid();
const dateTimeSchema = z.string().datetime({ offset: true });

export const conversationKindSchema = z.enum(CONVERSATION_KINDS);
export const messageDeliveryStateSchema = z.enum([
  "sending",
  "sent",
  "delivered",
  "failed",
  "read",
]);
export const conversationCursorSchema = z.string().min(1).max(512);
export const messageCursorSchema = z
  .number()
  .int()
  .positive()
  .max(2_147_483_647);

export const inboxRowSchema = z
  .object({
    id: idSchema,
    kind: conversationKindSchema,
    title: z.string().trim().min(1).max(200),
    latestMessage: z
      .object({
        preview: z.string().trim().min(1).max(160),
        createdAt: dateTimeSchema,
      })
      .strict()
      .nullable(),
    updatedAt: dateTimeSchema,
    unreadCount: z.number().int().nonnegative(),
  })
  .strict();

export const messageSchema = z
  .object({
    id: idSchema,
    sequence: messageCursorSchema,
    body: z.string().min(1).max(4_000),
    createdAt: dateTimeSchema,
    sender: z
      .object({
        id: idSchema,
        displayName: z.string().trim().min(1).max(200),
      })
      .strict(),
    recipientRead: z.boolean().nullable().optional(),
  })
  .strict();

export const composeMessageSchema = z
  .object({
    clientRequestId: idSchema,
    body: z.string().trim().min(1).max(4_000),
  })
  .strict();

export const recipientSearchResultSchema = z
  .object({
    id: idSchema,
    displayName: z.string().trim().min(1).max(200),
  })
  .strict();

export type InboxRow = z.infer<typeof inboxRowSchema>;
export type Message = z.infer<typeof messageSchema>;
export type ComposeMessage = z.infer<typeof composeMessageSchema>;
export type RecipientSearchResult = z.infer<typeof recipientSearchResultSchema>;
export type MessageDeliveryState = z.infer<typeof messageDeliveryStateSchema>;
