import { z } from "zod";

export const requestExportSchema = z
  .object({
    kind: z.enum(["FAMILY_DATA", "REPORT_ARCHIVE"]),
  })
  .strict();

export const requestDeletionSchema = z
  .object({
    reason: z.string().trim().min(1).max(2_000).optional(),
  })
  .strict();

export type RequestExportDto = z.infer<typeof requestExportSchema>;
export type RequestDeletionDto = z.infer<typeof requestDeletionSchema>;
