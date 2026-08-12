import { pacePolicyCodes, type PacePolicyCode } from "@pathway/ace-domain";

export type { PacePolicyCode } from "@pathway/ace-domain";

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
    pacePolicyCodes.includes(value as PacePolicyCode)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
