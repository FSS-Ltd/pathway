import { z } from "zod";

export const tripSlipIdSchema = z.string().uuid();

const timestamp = z.string().datetime({ offset: true });

export const tripInputSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    destination: z.string().trim().min(1).max(240),
    startsAt: timestamp,
    endsAt: timestamp,
  })
  .strict()
  .refine((trip) => new Date(trip.endsAt) > new Date(trip.startsAt), {
    path: ["endsAt"],
    message: "Trip end must be after its start",
  });

const questionSchema = z
  .object({
    id: tripSlipIdSchema.optional(),
    label: z.string().trim().min(1).max(240),
    required: z.boolean(),
  })
  .strict();

export const slipInputSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(4000).default(""),
    consentText: z.string().trim().min(1).max(4000),
    deadlineAt: timestamp,
    questions: z
      .array(questionSchema)
      .max(20)
      .refine(
        (questions) => {
          const ids = questions.flatMap((question) =>
            question.id ? [question.id] : [],
          );
          return new Set(ids).size === ids.length;
        },
        { message: "Choose each question once" },
      )
      .default([]),
    recipientChildIds: z
      .array(tripSlipIdSchema)
      .min(1)
      .max(500)
      .refine((ids) => new Set(ids).size === ids.length, {
        message: "Choose each child once",
      }),
  })
  .strict();

export const createSlipSchema = slipInputSchema.extend({
  tripId: tripSlipIdSchema,
});

export const updateSlipSchema = slipInputSchema.extend({
  expectedUpdatedAt: timestamp,
  trip: tripInputSchema.optional(),
});

export const reviseSlipSchema = slipInputSchema.extend({
  expectedVersionId: tripSlipIdSchema,
  trip: tripInputSchema.optional(),
});

export const publishSlipSchema = z
  .object({ expectedVersionId: tripSlipIdSchema })
  .strict();

export const scheduleSlipSchema = publishSlipSchema.extend({
  scheduledAt: timestamp,
});

export const cancelTripSchema = z
  .object({ reason: z.string().trim().min(1).max(1000) })
  .strict();

export const listTripsSchema = z
  .object({
    cursor: tripSlipIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export type TripInput = z.infer<typeof tripInputSchema>;
export type SlipInput = z.infer<typeof slipInputSchema>;
export type CreateSlipInput = z.infer<typeof createSlipSchema>;
export type UpdateSlipInput = z.infer<typeof updateSlipSchema>;
export type ReviseSlipInput = z.infer<typeof reviseSlipSchema>;
