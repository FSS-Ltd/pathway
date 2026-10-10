import { z } from "zod";

export const listNoticeInboxSchema = z
  .object({
    cursor: z.string().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  })
  .strict();

export type ListNoticeInboxDto = z.infer<typeof listNoticeInboxSchema>;
