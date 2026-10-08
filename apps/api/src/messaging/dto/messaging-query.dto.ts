import { z } from "zod";

const limit = z
  .string()
  .regex(/^(?:[1-9]|[1-4]\d|50)$/)
  .transform(Number)
  .optional();

export const conversationQuerySchema = z
  .object({ limit, cursor: z.string().min(1).max(512).optional() })
  .strict();

export const staffRecipientQuerySchema = z
  .object({
    search: z.string().trim().min(2).max(80),
    limit: z
      .string()
      .regex(/^(?:[1-9]|1\d|20)$/)
      .transform(Number)
      .optional(),
  })
  .strict();

export const parentRecipientQuerySchema = z
  .object({
    search: z.string().trim().min(2).max(80).optional(),
    limit: z
      .string()
      .regex(/^(?:[1-9]|1\d|20)$/)
      .transform(Number)
      .optional(),
  })
  .strict();

export const messageQuerySchema = z
  .object({
    limit,
    before: z
      .string()
      .regex(/^[1-9]\d{0,9}$/)
      .transform(Number)
      .pipe(z.number().int().max(2_147_483_647))
      .optional(),
  })
  .strict();

export const conversationIdSchema = z.string().uuid();
export const readCursorSchema = z
  .object({
    sequence: z.number().int().positive().max(2_147_483_647),
  })
  .strict();

export type ConversationQuery = z.infer<typeof conversationQuerySchema>;
export type StaffRecipientQuery = z.infer<typeof staffRecipientQuerySchema>;
export type ParentRecipientQuery = z.infer<typeof parentRecipientQuerySchema>;
export type MessageQuery = z.infer<typeof messageQuerySchema>;
export type ReadCursorInput = z.infer<typeof readCursorSchema>;
