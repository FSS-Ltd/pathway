import { z } from "zod";

const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());

export const recordPaceDiagnosticSchema = z
  .object({
    childId: id,
    subjectId: id,
    level: z.number().int().min(1).max(5),
    outcome: z.enum(["PASS", "FAIL"]),
  })
  .strict();

export const retractPaceDiagnosticSchema = z
  .object({ reason: z.string().trim().min(1).max(2000) })
  .strict();

export const paceDiagnosticIdSchema = id;

export type RecordPaceDiagnosticDto = z.infer<
  typeof recordPaceDiagnosticSchema
>;
export type RetractPaceDiagnosticDto = z.infer<
  typeof retractPaceDiagnosticSchema
>;
