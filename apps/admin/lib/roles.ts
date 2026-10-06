/**
 * Pure, testable logic for the roles & permissions admin surface (ACE-F13).
 * Kept separate from api-client.ts and the page components so it can be unit
 * tested with node:assert, matching this app's existing test convention.
 */

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
