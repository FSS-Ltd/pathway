import { z } from "zod";

type BehaviourType = "MERIT" | "DEMERIT" | "GENERAL";

interface EscalationBehaviourEntry {
  id: string;
  childId: string;
  type: BehaviourType;
  pointsDelta: number;
  occurredAt: Date;
  categoryIsSerious: boolean | null;
  note: string | null;
}

export interface EscalationPredecessor {
  id: string;
  type: BehaviourType;
  pointsDelta: number;
  occurredAt: Date;
  categoryIsSerious: boolean | null;
}

export interface EscalationActor {
  tenantId: string;
  orgId: string;
  userId: string;
}

export interface CreateDemeritIntentsInput {
  actor: EscalationActor;
  entry: EscalationBehaviourEntry;
  predecessor: EscalationPredecessor | null;
  timezone: string | null;
  now: Date;
}

export interface DemeritEscalationResult {
  stage: number;
  action: "none" | "review" | "notify" | "head-review";
  policyVersion: number;
  createdIntentCount: number;
}

export interface DemeritPolicyRecord {
  id: string;
  version: number;
  windowDays: number;
  stageOneThreshold: number;
  stageTwoThreshold: number;
  stageThreeThreshold: number;
  seriousMisconductStage: number;
}

export interface WindowedDemerit {
  pointsDelta: number;
  occurredAt: Date;
  categoryIsSerious: boolean | null;
}

const guardianNotificationFields = {
  aggregateId: z.string().trim().min(1),
  eventType: z.literal("behaviour.guardian-notification.requested"),
  idempotencyKey: z.string().trim().min(1),
};

const guardianNotificationPayloadFields = {
  childId: z.string().trim().min(1),
  tenantId: z.string().trim().min(1),
  orgId: z.string().trim().min(1),
  stage: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  demeritPolicyVersion: z.number().int().positive(),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  recipientUserIds: z.array(z.string().trim().min(1)).min(1),
};

export const guardianNotificationIntentSchema = z.discriminatedUnion(
  "aggregateType",
  [
    z
      .object({
        ...guardianNotificationFields,
        aggregateType: z.literal("BEHAVIOUR_ENTRY"),
        payload: z
          .object({
            ...guardianNotificationPayloadFields,
            behaviourEntryId: z.string().trim().min(1),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        ...guardianNotificationFields,
        aggregateType: z.literal("DEMERIT_STAGE_OVERRIDE"),
        payload: z
          .object({
            ...guardianNotificationPayloadFields,
            demeritStageOverrideId: z.string().trim().min(1),
          })
          .strict(),
      })
      .strict(),
  ],
);

export type GuardianNotificationIntent = z.infer<
  typeof guardianNotificationIntentSchema
>;

export interface LocalDateWindow {
  start: Date;
  end: Date;
  occurredOn: string;
}

export function localDateWindow(
  instant: Date,
  timezone: string,
  windowDays: number,
): LocalDateWindow {
  const occurredOn = localDateAt(instant, timezone);
  const startOn = addCalendarDays(occurredOn, -(windowDays - 1));
  const endOn = addCalendarDays(occurredOn, 1);
  return {
    start: localMidnightToUtc(startOn, timezone),
    end: localMidnightToUtc(endOn, timezone),
    occurredOn,
  };
}

export function localDateWindowForDate(
  localDate: string,
  timezone: string,
  windowDays: number,
): LocalDateWindow {
  const startOn = addCalendarDays(localDate, -(windowDays - 1));
  return {
    start: localMidnightToUtc(startOn, timezone),
    end: localMidnightToUtc(addCalendarDays(localDate, 1), timezone),
    occurredOn: localDate,
  };
}

export function currentLocalDate(instant: Date, timezone: string): string {
  return localDateAt(instant, timezone);
}

export function summariseDemerits(entries: readonly WindowedDemerit[]) {
  return {
    demeritUnits: entries.reduce(
      (total, entry) => total + Math.abs(entry.pointsDelta),
      0,
    ),
    hasSeriousMisconduct: entries.some(
      (entry) => entry.categoryIsSerious === true,
    ),
  };
}

export function toPolicyInput(policy: DemeritPolicyRecord) {
  return {
    stageOneThreshold: policy.stageOneThreshold,
    stageTwoThreshold: policy.stageTwoThreshold,
    stageThreeThreshold: policy.stageThreeThreshold,
    seriousMisconductStage: policy.seriousMisconductStage,
  };
}

export function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

export function uniqueRecipients<
  T extends { id: string; email: string | null },
>(recipients: T[]): Array<T & { email: string }> {
  const withEmail = recipients.filter(
    (recipient): recipient is T & { email: string } => Boolean(recipient.email),
  );
  return [...new Map(withEmail.map((item) => [item.id, item])).values()];
}

export function isIanaTimezone(value: string | null): value is string {
  if (!value?.trim()) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function localDateAt(instant: Date, timezone: string): string {
  const parts = dateTimeParts(instant, timezone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function addCalendarDays(localDate: string, days: number): string {
  const [year, month, day] = localDate.split("-").map(Number);
  const shifted = new Date(Date.UTC(year!, month! - 1, day! + days));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

function localMidnightToUtc(localDate: string, timezone: string): Date {
  const [year, month, day] = localDate.split("-").map(Number);
  const target = Date.UTC(year!, month! - 1, day!);
  let candidate = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = dateTimeParts(new Date(candidate), timezone);
    const represented = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const corrected = candidate + (target - represented);
    if (corrected === candidate) return new Date(candidate);
    candidate = corrected;
  }
  return new Date(candidate);
}

function dateTimeParts(instant: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
