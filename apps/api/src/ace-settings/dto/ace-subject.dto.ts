import { z } from "zod";

const subjectNameSchema = z.string().trim().min(1).max(120);
const reasonSchema = z.string().trim().min(1).max(1_000);

export const subjectIdSchema = z.string().uuid();

export const createAceSubjectSchema = z
  .object({ name: subjectNameSchema, reason: reasonSchema })
  .strict();

export const renameAceSubjectSchema = createAceSubjectSchema;

export const deactivateAceSubjectSchema = z
  .object({ reason: reasonSchema })
  .strict();

export type CreateAceSubjectDto = z.infer<typeof createAceSubjectSchema>;
export type RenameAceSubjectDto = z.infer<typeof renameAceSubjectSchema>;
export type DeactivateAceSubjectDto = z.infer<
  typeof deactivateAceSubjectSchema
>;
