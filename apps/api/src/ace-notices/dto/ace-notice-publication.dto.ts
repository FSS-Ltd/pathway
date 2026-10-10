import { z } from "zod";

export const publishNoticeSchema = z
  .object({
    expectedUpdatedAt: z.string().datetime({ offset: true }),
    expectedAudienceVersion: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const withdrawNoticeSchema = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();

export type PublishNoticeDto = z.infer<typeof publishNoticeSchema>;
export type WithdrawNoticeDto = z.infer<typeof withdrawNoticeSchema>;
