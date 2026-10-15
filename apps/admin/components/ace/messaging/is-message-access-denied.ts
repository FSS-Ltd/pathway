import { ApiError } from "@/lib/api-transport";

export function isMessageAccessDenied(error: unknown): boolean {
  return error instanceof ApiError && [401, 403, 404].includes(error.status);
}
