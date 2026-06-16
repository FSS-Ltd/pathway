export type RoleLookupStatus = {
  error: string | null;
  warning: string | null;
};

export function getRoleLookupFailureStatus(
  err: unknown,
  hasSessionRoles: boolean,
): RoleLookupStatus {
  const message =
    err instanceof Error ? err.message : "Failed to load user roles";

  if (hasSessionRoles) {
    return {
      error: null,
      warning: `${message}. Using saved session roles.`,
    };
  }

  return {
    error: message,
    warning: null,
  };
}
