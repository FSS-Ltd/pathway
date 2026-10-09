import { z } from "zod";

export const timetableIdSchema = z.string().uuid();

const daySchema = z.enum([
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
]);
const reasonSchema = z.string().trim().min(1).max(1_000);
const revisionSchema = z.string().datetime({ offset: true });

const slotSchema = z
  .object({
    id: timetableIdSchema.optional(),
    kind: z.enum(["LESSON", "BREAK"]),
    label: z.string().trim().min(1).max(50),
    startMinutes: z.number().int().min(0).max(1_439),
    endMinutes: z.number().int().min(1).max(1_440),
  })
  .strict()
  .refine((slot) => slot.endMinutes > slot.startMinutes, {
    path: ["endMinutes"],
    message: "A slot must end after it starts",
  });

export const saveTimetableScheduleSchema = z
  .object({
    expectedUpdatedAt: revisionSchema.nullable(),
    teachingDays: z.array(daySchema).min(1).max(7),
    slots: z.array(slotSchema).min(1).max(16),
    reason: reasonSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.teachingDays).size !== value.teachingDays.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["teachingDays"],
        message: "Teaching days must be distinct",
      });
    }
    const ids = value.slots.flatMap((slot) => (slot.id ? [slot.id] : []));
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["slots"],
        message: "Slot IDs must be distinct",
      });
    }
    value.slots.forEach((slot, index) => {
      if (index && slot.startMinutes < value.slots[index - 1].endMinutes) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slots", index, "startMinutes"],
          message: "Timetable slots must be ordered and non-overlapping",
        });
      }
    });
  });

export const saveStudentTimetableDraftSchema = z
  .object({
    scheduleId: timetableIdSchema,
    scheduleUpdatedAt: revisionSchema,
    expectedVersion: z.number().int().min(0),
    entries: z
      .array(
        z
          .object({
            day: daySchema,
            slotId: timetableIdSchema,
            subjectId: timetableIdSchema,
          })
          .strict(),
      )
      .max(112),
    reason: reasonSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const cells = value.entries.map((entry) => `${entry.day}:${entry.slotId}`);
    if (new Set(cells).size !== cells.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entries"],
        message: "A lesson cell may have only one subject",
      });
    }
  });

export const publishStudentTimetableSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    scheduleUpdatedAt: revisionSchema,
    acknowledgeUnassigned: z.boolean(),
    reason: reasonSchema,
  })
  .strict();

export const withdrawStudentTimetableSchema = z
  .object({
    publicationId: timetableIdSchema,
    reason: z.string().trim().min(1).max(240),
  })
  .strict();

export const timetableRosterQuerySchema = z
  .object({
    cursor: timetableIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  })
  .strict();

export type SaveTimetableScheduleDto = z.infer<
  typeof saveTimetableScheduleSchema
>;
export type SaveStudentTimetableDraftDto = z.infer<
  typeof saveStudentTimetableDraftSchema
>;
export type PublishStudentTimetableDto = z.infer<
  typeof publishStudentTimetableSchema
>;
export type WithdrawStudentTimetableDto = z.infer<
  typeof withdrawStudentTimetableSchema
>;
export type TimetableRosterQueryDto = z.infer<
  typeof timetableRosterQuerySchema
>;
