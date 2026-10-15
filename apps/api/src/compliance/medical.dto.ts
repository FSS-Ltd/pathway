import { z } from "zod";

const medicalFieldSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("UNKNOWN"), details: z.null() }).strict(),
  z.object({ status: z.literal("NONE"), details: z.null() }).strict(),
  z
    .object({
      status: z.literal("RECORDED"),
      details: z
        .string()
        .trim()
        .min(1)
        .max(5000)
        .refine(
          (value) => !/^(none|unknown)$/i.test(value),
          "Choose None or Unknown instead",
        ),
    })
    .strict(),
]);
export const medicalUpdateSchema = z
  .object({
    expectedUpdatedAt: z.string().datetime(),
    allergies: medicalFieldSchema,
    medicalConditions: medicalFieldSchema,
    medicationAtSite: medicalFieldSchema,
  })
  .strict();
export const medicalListSchema = z
  .object({ cursor: z.string().uuid().optional() })
  .strict();
