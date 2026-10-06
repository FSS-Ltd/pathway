import { createHash } from "node:crypto";
import { decodePaceRosterCursor, encodePaceRosterCursor } from "./pace-cursor";

interface DiagnosticCursorScope {
  tenantId: string;
  orgId: string;
  childId: string;
  subjectId: string;
  includeRetracted: boolean;
}

export function createPaceDiagnosticCursorScope(
  scope: DiagnosticCursorScope,
): string {
  return createHash("sha256").update(JSON.stringify(scope)).digest("base64url");
}

export function decodePaceDiagnosticCursor(encoded: string, scope: string) {
  const cursor = decodePaceRosterCursor(encoded);
  if (cursor.scope !== scope) throw new Error("Cursor scope mismatch");
  return cursor;
}

export const encodePaceDiagnosticCursor = encodePaceRosterCursor;
