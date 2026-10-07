import { z } from "zod";

const limit = z
  .string()
  .regex(/^(?:[1-9]|[1-4]\d|50)$/)
  .transform(Number)
  .optional();

export const conversationQuerySchema = z
  .object({ limit, cursor: z.string().min(1).max(512).optional() })
  .strict();

export type ConversationQuery = z.infer<typeof conversationQuerySchema>;
