import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { slipInputSchema, type SlipInput } from "./trip-slip.dto";

const snapshotSchema = slipInputSchema
  .omit({ recipientChildIds: true, questions: true })
  .extend({
    schemaVersion: z.literal(1),
    tripTitle: z.string().trim().min(1).max(160),
    destination: z.string().trim().min(1).max(240),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    questions: z.array(
      z.object({
        id: z.string().uuid(),
        label: z.string().trim().min(1).max(240),
        required: z.boolean(),
      }),
    ),
    recipientChildIds: z.array(z.string().uuid()).min(1).max(500),
  })
  .strict();

export type PermissionSlipSnapshot = z.infer<typeof snapshotSchema>;

export function makeSlipSnapshot(
  trip: { title: string; destination: string; startsAt: Date; endsAt: Date },
  input: SlipInput,
  previous?: PermissionSlipSnapshot,
): PermissionSlipSnapshot {
  return snapshotSchema.parse({
    schemaVersion: 1,
    tripTitle: trip.title,
    title: input.title,
    description: input.description,
    destination: trip.destination,
    startsAt: trip.startsAt.toISOString(),
    endsAt: trip.endsAt.toISOString(),
    consentText: input.consentText,
    deadlineAt: new Date(input.deadlineAt).toISOString(),
    questions: input.questions.map((question, index) => {
      const old = previous?.questions[index];
      return {
        id:
          question.id ??
          (old?.label === question.label && old.required === question.required
            ? old.id
            : randomUUID()),
        label: question.label,
        required: question.required,
      };
    }),
    recipientChildIds: [...input.recipientChildIds].sort(),
  });
}

export function parseSlipSnapshot(value: unknown): PermissionSlipSnapshot {
  return snapshotSchema.parse(value);
}

export function slipVersionHash(snapshot: PermissionSlipSnapshot): string {
  const canonical = [
    snapshot.schemaVersion,
    snapshot.tripTitle,
    snapshot.title,
    snapshot.description,
    snapshot.destination,
    snapshot.startsAt,
    snapshot.endsAt,
    snapshot.consentText,
    snapshot.deadlineAt,
    snapshot.questions.map((question) => [
      question.id,
      question.label,
      question.required,
    ]),
    snapshot.recipientChildIds,
  ];
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function classifySlipChange(
  previous: PermissionSlipSnapshot,
  next: PermissionSlipSnapshot,
): "MATERIAL" | "NON_MATERIAL" {
  const materialFields = (snapshot: PermissionSlipSnapshot): unknown[] => [
    snapshot.description,
    snapshot.destination,
    snapshot.startsAt,
    snapshot.endsAt,
    snapshot.consentText,
    snapshot.deadlineAt,
    snapshot.questions,
    snapshot.recipientChildIds,
  ];
  return JSON.stringify(materialFields(previous)) ===
    JSON.stringify(materialFields(next))
    ? "NON_MATERIAL"
    : "MATERIAL";
}
