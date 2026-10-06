import { createHash } from "node:crypto";
import { decodePaceRosterCursor, encodePaceRosterCursor } from "./pace-cursor";

export interface PaceInventoryCursorScope {
  tenantId: string;
  orgId: string;
  view: "orders" | "stock";
  childId?: string;
  status?: string;
  attentionOnly?: boolean;
}

export function createPaceInventoryCursorScope(
  scope: PaceInventoryCursorScope,
): string {
  return createHash("sha256").update(JSON.stringify(scope)).digest("base64url");
}

export function parsePaceInventoryCursor(encoded: string, scope: string) {
  const cursor = decodePaceRosterCursor(encoded);
  if (cursor.scope !== scope) throw new Error("Cursor scope mismatch");
  return cursor;
}

export const encodePaceInventoryCursor = encodePaceRosterCursor;
