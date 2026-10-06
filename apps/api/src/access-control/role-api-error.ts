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
  CUSTOM_ROLES_RETIRED:
    "Custom roles are no longer available. Use fixed roles and access tags.",
  LAST_HEAD_PROTECTED: "The final active organisation head cannot be removed.",
  SELF_LOCKOUT_PROTECTED:
    "This change would remove your access-management authority.",
  UNKNOWN_PERMISSION_KEY: "One or more permission keys are unknown.",
  INACTIVE_PERMISSION_KEY: "One or more permission keys are unavailable.",
  NON_DELEGABLE_PERMISSION_KEY:
    "One or more permission keys cannot be delegated.",
  ILLEGAL_ROLE_SCOPE:
    "One or more permissions are incompatible with this role scope.",
  ACTOR_CANNOT_DELEGATE: "You cannot delegate one or more permissions.",
  INVALID_ASSIGNMENT_REQUEST: "The assignment request is invalid.",
  ASSIGNMENT_API_ACCESS_DENIED:
    "You are not allowed to manage role assignments.",
  ASSIGNMENT_NOT_FOUND: "The role assignment was not found.",
  ASSIGNMENT_ALREADY_REVOKED: "The role assignment is already revoked.",
  ASSIGNMENT_OVERLAP:
    "The role assignment overlaps an existing active assignment.",
  INVALID_ASSIGNMENT_SCOPE: "The role assignment scope is invalid.",
  INVALID_ASSIGNMENT_WINDOW: "The role assignment time window is invalid.",
  ROLE_NOT_ASSIGNABLE: "The selected role cannot be assigned.",
  ASSIGNEE_NOT_IN_ORGANISATION:
    "The selected user is not an active organisation member.",
  INVALID_EFFECTIVE_ACCESS_REQUEST: "The effective access request is invalid.",
  EFFECTIVE_ACCESS_API_ACCESS_DENIED:
    "You are not allowed to view effective access.",
  INVALID_AUDIT_REQUEST: "The audit log request is invalid.",
  AUDIT_API_ACCESS_DENIED: "You are not allowed to view the audit log.",
  INVALID_PERMISSIONS_REQUEST: "The permissions request is invalid.",
  PERMISSIONS_API_ACCESS_DENIED:
    "You are not allowed to view delegable permissions.",
  INVALID_ACCESS_TAG_REQUEST: "The access-tag request is invalid.",
  INVALID_ACCESS_TAG_WINDOW: "The access-tag validity window is invalid.",
  ACCESS_TAG_UNAVAILABLE: "This access tag is not available.",
  ACCESS_TAG_ACTOR_NOT_HEAD:
    "Only an organisation head can manage access tags.",
  ACCESS_TAG_ASSIGNEE_NOT_IN_SITE:
    "The selected user is not a member of this site.",
  ACCESS_TAG_CANNOT_DELEGATE:
    "You cannot delegate this access tag in the selected scope.",
  ACCESS_TAG_ALREADY_GRANTED: "This access tag has already been granted.",
  ACCESS_TAG_GRANT_NOT_FOUND: "The access-tag grant was not found.",
  ACCESS_TAG_ALREADY_REVOKED: "This access-tag grant is already revoked.",
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
