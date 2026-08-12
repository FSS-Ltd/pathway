export type PacePolicyCode =
  | "allowed"
  | "score-below-threshold"
  | "daily-limit"
  | "duplicate-self-test"
  | "same-pace-same-day"
  | "progression-blocked"
  | "override-required";

export function parsePaceErrorBody(value: unknown): {
  message: string | null;
  policyCode: PacePolicyCode | null;
} {
  if (!isRecord(value)) return { message: null, policyCode: null };

  const message =
    typeof value.message === "string" && value.message.trim()
      ? value.message
      : null;
  const details = isRecord(value.details) ? value.details : null;
  const policyCode =
    details && isPacePolicyCode(details.policyCode) ? details.policyCode : null;

  return { message, policyCode };
}

function isPacePolicyCode(value: unknown): value is PacePolicyCode {
  return (
    typeof value === "string" &&
    [
      "allowed",
      "score-below-threshold",
      "daily-limit",
      "duplicate-self-test",
      "same-pace-same-day",
      "progression-blocked",
      "override-required",
    ].includes(value)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
