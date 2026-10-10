import { z } from "zod";

export const noticeTargetQuerySchema = z
  .object({
    scope: z.enum(["YEAR_BAND", "GROUP", "CHILD"]),
    search: z.string().trim().max(80).default(""),
    selectedId: z.string().uuid().optional(),
  })
  .strict();

export type NoticeTargetQuery = z.infer<typeof noticeTargetQuerySchema>;
