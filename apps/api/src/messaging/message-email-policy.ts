export interface MessageEmailPolicyInput {
  activeParticipant: boolean;
  muted: boolean;
  activeAccount: boolean;
  permitted: boolean;
  emailEnabled: boolean;
  email: string | null;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string | null;
  now: Date;
}

export type MessageEmailDecision =
  | { send: true }
  | {
      send: false;
      reason:
        | "REMOVED_PARTICIPANT"
        | "MUTED_CONVERSATION"
        | "INACTIVE_ACCOUNT"
        | "ACCESS_REVOKED"
        | "CHANNEL_DISABLED"
        | "MISSING_EMAIL"
        | "INVALID_TIMEZONE"
        | "INVALID_QUIET_HOURS"
        | "QUIET_HOURS";
    };

export const MESSAGE_EMAIL_SUBJECT = "New NexSteps message";
export const MESSAGE_EMAIL_BODY =
  "You have a new NexSteps message. Sign in to your school portal to read it.";

export function decideMessageEmail(
  input: MessageEmailPolicyInput,
): MessageEmailDecision {
  if (!input.activeParticipant)
    return { send: false, reason: "REMOVED_PARTICIPANT" };
  if (input.muted) return { send: false, reason: "MUTED_CONVERSATION" };
  if (!input.activeAccount) return { send: false, reason: "INACTIVE_ACCOUNT" };
  if (!input.permitted) return { send: false, reason: "ACCESS_REVOKED" };
  if (!input.emailEnabled) return { send: false, reason: "CHANNEL_DISABLED" };
  if (!input.email) return { send: false, reason: "MISSING_EMAIL" };
  if (!input.timezone) return { send: false, reason: "INVALID_TIMEZONE" };

  let localMinutes: number;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: input.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(input.now);
    localMinutes =
      Number(parts.find((part) => part.type === "hour")?.value) * 60 +
      Number(parts.find((part) => part.type === "minute")?.value);
    if (!Number.isInteger(localMinutes))
      return { send: false, reason: "INVALID_TIMEZONE" };
  } catch {
    return { send: false, reason: "INVALID_TIMEZONE" };
  }

  const start = toMinutes(input.quietHoursStart);
  const end = toMinutes(input.quietHoursEnd);
  if (
    (input.quietHoursStart !== null || input.quietHoursEnd !== null) &&
    (start === null || end === null || start === end)
  ) {
    return { send: false, reason: "INVALID_QUIET_HOURS" };
  }
  if (start !== null && end !== null) {
    const quiet =
      start < end
        ? localMinutes >= start && localMinutes < end
        : localMinutes >= start || localMinutes < end;
    if (quiet) return { send: false, reason: "QUIET_HOURS" };
  }
  return { send: true };
}

function toMinutes(value: string | null): number | null {
  if (!value || !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value)) return null;
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}
