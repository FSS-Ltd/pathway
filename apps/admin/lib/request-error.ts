import { ApiError } from "./api-transport";

export type RequestFailure = {
  kind: "session" | "denied" | "unavailable";
  message: string;
};

function errorStatus(error: unknown): number | null {
  if (
    error instanceof Error &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }
  return null;
}

/** Only known, safe copy reaches the page; server bodies and thrown messages stay hidden. */
export function requestFailure(
  error: unknown,
  fallback: string,
): RequestFailure {
  const reference =
    error instanceof ApiError && error.requestId
      ? ` Reference: ${error.requestId}`
      : "";
  const status = errorStatus(error);
  if (status === 401) {
    return {
      kind: "session",
      message: `Your session could not be verified. Please sign in again.${reference}`,
    };
  }
  if (status === 403) {
    return {
      kind: "denied",
      message: `You do not have permission for this action.${reference}`,
    };
  }
  return { kind: "unavailable", message: `${fallback}${reference}` };
}
