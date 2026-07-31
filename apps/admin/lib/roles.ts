/**
 * Pure, testable logic for the roles & permissions admin surface (ACE-F13).
 * Kept separate from api-client.ts and the page components so it can be unit
 * tested with node:assert, matching this app's existing test convention.
 */

import { CAPABILITY_DEFINITIONS, type PermissionKey } from "@pathway/platform/capability-definitions";
import { VERTICAL_CAPABILITIES } from "@pathway/platform/capability-maps";
import { toLocalDateKey } from "./date";

export function groupPermissionsByPrefix(
  keys: string[],
): Array<{ prefix: string; keys: string[] }> {
  const byPrefix = new Map<string, string[]>();
  for (const key of keys) {
    const prefix = key.split(".")[0] ?? key;
    const group = byPrefix.get(prefix) ?? [];
    group.push(key);
    byPrefix.set(prefix, group);
  }
  return [...byPrefix.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([prefix, groupKeys]) => ({
      prefix,
      keys: [...groupKeys].sort((a, b) => a.localeCompare(b)),
    }));
}

export type BadgeVariant = "default" | "warning" | "danger";

export function sensitivityBadgeVariant(
  sensitivity: "standard" | "sensitive" | "protected",
): BadgeVariant {
  switch (sensitivity) {
    case "protected":
      return "danger";
    case "sensitive":
      return "warning";
    default:
      return "default";
  }
}

// ponytail: mirrors packages/db/src/role-scope-compatibility.ts. @pathway/db
// is not an apps/admin dependency and shouldn't become one for a 12-line
// lookup table; keep this in sync manually if that matrix ever changes.
export type RolePermissionScope = "organisation" | "site" | "relationship" | "assignment";
export type RoleScope = "organisation" | "site";

const COMPATIBLE_PERMISSION_SCOPES: Readonly<
  Record<RoleScope, ReadonlySet<RolePermissionScope>>
> = {
  organisation: new Set(["organisation", "site", "relationship", "assignment"]),
  site: new Set(["site", "relationship", "assignment"]),
};

export function roleScopeAcceptsPermissionScope(
  roleScope: RoleScope,
  permissionScope: RolePermissionScope,
): boolean {
  return COMPATIBLE_PERMISSION_SCOPES[roleScope].has(permissionScope);
}

function isKnownPermissionKey(key: string): key is PermissionKey {
  return key in CAPABILITY_DEFINITIONS;
}

/**
 * The permission keys a picker should render: what the actor can delegate,
 * unioned with any already-selected keys (e.g. on the edit page, a key the
 * actor can no longer delegate must stay visible — checked and disabled —
 * rather than disappear while still present in submitted state), filtered to
 * keys compatible with the role's scope.
 */
export function selectablePermissionKeys(
  roleScope: RoleScope,
  delegableKeys: string[],
  alsoInclude: string[] = [],
): string[] {
  const union = new Set([...delegableKeys, ...alsoInclude]);
  return [...union]
    .filter(
      (key): key is PermissionKey =>
        isKnownPermissionKey(key) &&
        roleScopeAcceptsPermissionScope(roleScope, CAPABILITY_DEFINITIONS[key].scope),
    )
    .sort((a, b) => a.localeCompare(b));
}

// Intersection of every vertical's capability set — permissions meaningful to
// every organisation regardless of sector. Derived at runtime rather than
// hand-copied, so it can't drift from capability-maps.ts; that file is not
// edited or re-exported beyond this read.
const CORE_PERMISSION_KEYS: ReadonlySet<string> = (() => {
  const verticalSets = Object.values(VERTICAL_CAPABILITIES).map(
    (keys) => new Set<string>(keys),
  );
  const [first, ...rest] = verticalSets;
  if (!first) return new Set();
  return new Set(
    [...first].filter((key) => rest.every((set) => set.has(key))),
  );
})();

export function partitionCorePermissions(keys: string[]): {
  core: string[];
  sector: string[];
} {
  const core: string[] = [];
  const sector: string[] = [];
  for (const key of keys) {
    (CORE_PERMISSION_KEYS.has(key) ? core : sector).push(key);
  }
  return { core, sector };
}

export function filterPermissionsBySearch(
  keys: string[],
  query: string,
): string[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return keys;
  return keys.filter((key) => {
    if (key.toLowerCase().includes(trimmed)) return true;
    if (!isKnownPermissionKey(key)) return false;
    const definition = CAPABILITY_DEFINITIONS[key];
    return (
      definition.label.toLowerCase().includes(trimmed) ||
      definition.description.toLowerCase().includes(trimmed)
    );
  });
}

export interface PermissionCheckState {
  checked: boolean;
  disabled: boolean;
  reason?: string;
}

export function computePermissionCheckState(
  delegable: boolean,
  inDelegableSet: boolean,
  selected: boolean,
): PermissionCheckState {
  if (!delegable) {
    return {
      checked: false,
      disabled: true,
      reason: "This permission cannot be delegated to a role.",
    };
  }
  if (!inDelegableSet) {
    return {
      checked: selected,
      disabled: true,
      reason: "You cannot delegate this permission.",
    };
  }
  return { checked: selected, disabled: false };
}

export function parseCodedError(error: unknown): {
  code: string | null;
  message: string;
} {
  const message = error instanceof Error ? error.message : String(error);
  const separator = message.indexOf(":");
  if (separator > 0 && /^[A-Z][A-Z0-9_]*$/.test(message.slice(0, separator))) {
    return {
      code: message.slice(0, separator),
      message: message.slice(separator + 1).trim(),
    };
  }
  return { code: null, message: message || "An unknown error occurred." };
}

export function formatAssignmentWindow(
  startsAt: string,
  expiresAt: string | null,
): string {
  const start = toLocalDateKey(new Date(startsAt));
  if (!expiresAt) {
    return `Since ${start}`;
  }
  return `${start} – ${toLocalDateKey(new Date(expiresAt))}`;
}

export function formatAuditTimestamp(iso: string): string {
  const date = new Date(iso);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${toLocalDateKey(date)} ${hours}:${minutes}`;
}
