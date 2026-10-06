import { AccessTagKey as StoredAccessTagKey } from "@prisma/client";
import type { AccessTagKey } from "@pathway/platform";

const TAG_KEYS = [
  ["shopkeeper", StoredAccessTagKey.SHOPKEEPER],
  ["shopadmin", StoredAccessTagKey.SHOPADMIN],
  ["finance-admin", StoredAccessTagKey.FINANCE_ADMIN],
  ["leaderboard-admin", StoredAccessTagKey.LEADERBOARD_ADMIN],
  ["attendance-exporter", StoredAccessTagKey.ATTENDANCE_EXPORTER],
  ["attendance-recorder", StoredAccessTagKey.ATTENDANCE_RECORDER],
  ["audit-viewer", StoredAccessTagKey.AUDIT_VIEWER],
  ["sensitive-note-viewer", StoredAccessTagKey.SENSITIVE_NOTE_VIEWER],
  ["behaviour-viewer", StoredAccessTagKey.BEHAVIOUR_VIEWER],
  [
    "student-drillthrough-viewer",
    StoredAccessTagKey.STUDENT_DRILLTHROUGH_VIEWER,
  ],
  ["pace-full-access", StoredAccessTagKey.PACE_FULL_ACCESS],
  ["supervisor-all-students", StoredAccessTagKey.SUPERVISOR_ALL_STUDENTS],
  [
    "supervisor-primary-students",
    StoredAccessTagKey.SUPERVISOR_PRIMARY_STUDENTS,
  ],
  ["calendar-manager", StoredAccessTagKey.CALENDAR_MANAGER],
  ["parent-message-responder", StoredAccessTagKey.PARENT_MESSAGE_RESPONDER],
  ["club-lead", StoredAccessTagKey.CLUB_LEAD],
  ["librarian", StoredAccessTagKey.LIBRARIAN],
] as const satisfies readonly (readonly [AccessTagKey, StoredAccessTagKey])[];

export function allAccessTagKeys(): readonly AccessTagKey[] {
  return TAG_KEYS.map(([key]) => key);
}

export function toStoredAccessTagKey(key: AccessTagKey): StoredAccessTagKey {
  const pair = TAG_KEYS.find(([publicKey]) => publicKey === key);
  if (!pair) throw new Error(`Unmapped access tag: ${key}`);
  return pair[1];
}

export function fromStoredAccessTagKey(key: StoredAccessTagKey): AccessTagKey {
  const pair = TAG_KEYS.find(([, storedKey]) => storedKey === key);
  if (!pair) throw new Error(`Unmapped stored access tag: ${key}`);
  return pair[0];
}
