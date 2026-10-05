import type { PermissionKey } from "./capability-definitions";

/**
 * Oasis permission tags expressed as platform-owned Nexsteps permission keys.
 * This catalogue describes tag intent; it never grants authority by itself.
 * Grant and request evaluation must still enforce actor delegation, active
 * capabilities, site scope, relationships, and safeguarding rules.
 */
export const ACCESS_TAG_DEFINITIONS = {
  shopkeeper: {
    label: "Shopkeeper",
    description: "Reserved for staff-operated Merit Shop sales.",
    permissionKeys: [],
  },
  shopadmin: {
    label: "Shop administrator",
    description: "Manage Merit Shop items and reservations.",
    permissionKeys: ["merit.shop.manage"],
  },
  "finance-admin": {
    label: "Finance administrator",
    description: "Manage family invoices, payments, and reports.",
    permissionKeys: [
      "finance.family_invoices.manage",
      "finance.family_payments.record",
      "finance.family_reports.read",
    ],
  },
  "leaderboard-admin": {
    label: "Leaderboard administrator",
    description: "Reserved for positive-only leaderboard administration.",
    permissionKeys: [],
  },
  "attendance-exporter": {
    label: "Attendance exporter",
    description: "Reserved until attendance export has its own permission.",
    permissionKeys: [],
  },
  "attendance-recorder": {
    label: "Attendance recorder",
    description: "Record attendance for the granted organisation or site.",
    permissionKeys: ["attendance.manage"],
  },
  "audit-viewer": {
    label: "Audit viewer",
    description:
      "Reserved until protected audit access can be delegated safely.",
    permissionKeys: ["platform.access.audit.read"],
  },
  "sensitive-note-viewer": {
    label: "Sensitive note viewer",
    description: "Reserved until safeguarding access can be delegated safely.",
    permissionKeys: ["safeguarding.concerns.read"],
  },
  "behaviour-viewer": {
    label: "Behaviour viewer",
    description: "View behaviour records within existing site and child scope.",
    permissionKeys: ["ace.behaviour.read"],
  },
  "student-drillthrough-viewer": {
    label: "Student drillthrough viewer",
    description:
      "Reserved until student read and record-scope checks are ready.",
    permissionKeys: [],
  },
  "pace-full-access": {
    label: "PACE full access",
    description: "Use PACE read, record, correction, and override permissions.",
    permissionKeys: [
      "ace.pace.read",
      "ace.pace.record",
      "ace.pace.correct",
      "ace.pace.override",
    ],
  },
  "supervisor-all-students": {
    label: "Supervisor: all assigned students",
    description:
      "Unavailable until daily staff-shift and student-group scope checks are enforced.",
    permissionKeys: [],
  },
  "supervisor-primary-students": {
    label: "Supervisor: primary students",
    description:
      "Unavailable until primary-band and daily staff-shift scope checks are enforced.",
    permissionKeys: [],
  },
  "calendar-manager": {
    label: "Calendar manager",
    description: "Reserved until calendar management has its own permission.",
    permissionKeys: [],
  },
  "parent-message-responder": {
    label: "Parent message responder",
    description: "Respond to conversations only for linked families.",
    permissionKeys: ["messaging.messages.send"],
  },
  "club-lead": {
    label: "Club lead",
    description: "Reserved for assigned club activity in the Clubs module.",
    permissionKeys: ["clubs.read", "clubs.attendance.record"],
  },
  librarian: {
    label: "Librarian",
    description:
      "Reserved for catalogue loans and returns in the Library module.",
    permissionKeys: [],
  },
} as const satisfies Record<
  string,
  {
    label: string;
    description: string;
    permissionKeys: readonly PermissionKey[];
  }
>;

export type AccessTagKey = keyof typeof ACCESS_TAG_DEFINITIONS;

const UNAVAILABLE_ACCESS_TAGS = new Set<AccessTagKey>([
  "shopkeeper",
  "shopadmin",
  "leaderboard-admin",
  "attendance-exporter",
  "audit-viewer",
  "sensitive-note-viewer",
  "student-drillthrough-viewer",
  "supervisor-all-students",
  "supervisor-primary-students",
  "calendar-manager",
  "club-lead",
  "librarian",
]);

export function isAccessTagAvailable(tag: AccessTagKey): boolean {
  return !UNAVAILABLE_ACCESS_TAGS.has(tag);
}

export function accessTagPermissionKeys(
  tag: AccessTagKey,
): readonly PermissionKey[] {
  const definition = ACCESS_TAG_DEFINITIONS[tag];
  return isAccessTagAvailable(tag) ? definition.permissionKeys : [];
}
