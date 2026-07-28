import { HttpException, HttpStatus } from "@nestjs/common";

export interface RoleApiErrorResponse {
  readonly statusCode: number;
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
  readonly requestId: string;
}

const SAFE_MESSAGES: Readonly<Record<string, string>> = {
  INVALID_ROLE_REQUEST: "The role request is invalid.",
  INVALID_SELECTED_SITE: "The selected site is not available.",
  ROLE_API_ACCESS_DENIED: "You are not allowed to manage roles.",
  ROLE_NOT_FOUND: "The role was not found.",
  ROLE_NAME_CONFLICT: "A role with this name already exists in this scope.",
  ROLE_VERSION_CONFLICT: "The role was changed by another request.",
  SYSTEM_ROLE_PROTECTED: "System roles cannot be changed.",
  UNKNOWN_PERMISSION_KEY: "One or more permission keys are unknown.",
  INACTIVE_PERMISSION_KEY: "One or more permission keys are unavailable.",
  NON_DELEGABLE_PERMISSION_KEY: "One or more permission keys cannot be delegated.",
  ILLEGAL_ROLE_SCOPE: "One or more permissions are incompatible with this role scope.",
  ACTOR_CANNOT_DELEGATE: "You cannot delegate one or more permissions.",
};

export function roleApiError(
  status: HttpStatus,
  code: keyof typeof SAFE_MESSAGES,
  requestId: string,
  details?: Record<string, unknown>,
): HttpException {
  const response: RoleApiErrorResponse = {
    statusCode: status,
    code,
    message: SAFE_MESSAGES[code],
    ...(details ? { details } : {}),
    requestId,
  };
  return new HttpException(response, status);
}
