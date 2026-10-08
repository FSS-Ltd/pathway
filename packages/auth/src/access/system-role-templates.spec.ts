import { SYSTEM_ROLE_TEMPLATES } from "./system-role-templates";

// Core permissions every template should carry so it's meaningful in every
// vertical once seedSystemRoles intersects it with the org's active
// capabilities (see packages/db/src/seed-system-roles.ts). Mirrors
// PLATFORM_CORE_CAPABILITIES in packages/platform/src/capability-maps.ts.
const CORE_PERMISSIONS = [
  "attendance.read",
  "attendance.manage",
  "platform.access.roles.read",
  "platform.access.roles.manage",
  "platform.access.permissions.read",
  "platform.access.assignments.read",
  "platform.access.assignments.manage",
  "platform.access.users.read",
  "platform.access.audit.read",
  "messaging.conversations.read",
  "messaging.conversations.create",
  "messaging.messages.read",
  "messaging.messages.send",
  "notices.read",
  "notices.manage",
  "notices.publish",
  "safeguarding.concerns.record",
  "safeguarding.concerns.read",
  "safeguarding.concerns.manage",
];

describe("ACE system role templates", () => {
  it("defines the approved protected template scopes and permission mappings", () => {
    expect(SYSTEM_ROLE_TEMPLATES).toEqual({
      organisationHead: {
        name: "Organisation Head",
        scope: "organisation",
        protected: true,
        permissions: [
          "platform.access.roles.read",
          "platform.access.roles.manage",
          "platform.access.permissions.read",
          "platform.access.assignments.read",
          "platform.access.assignments.manage",
          "platform.access.users.read",
          "platform.access.audit.read",
          "attendance.read",
          "attendance.manage",
          "ace.attendance.export",
          "messaging.conversations.read",
          "messaging.conversations.create",
          "messaging.messages.read",
          "messaging.messages.send",
          "notices.read",
          "notices.manage",
          "notices.publish",
          "safeguarding.concerns.read",
          "safeguarding.concerns.manage",
          "students.manage",
          "classes.manage",
          "parents.read",
          "reports.read",
          "children.manage",
          "members.manage",
          "volunteers.manage",
          "giving.manage",
          "calendar.read",
          "ace.dashboard.read",
          "ace.settings.read",
          "ace.settings.manage",
          "ace.pace.read",
          "ace.pace.record",
          "ace.pace.correct",
          "ace.pace.override",
          "ace.pace.inventory.read",
          "ace.pace.inventory.manage",
          "ace.pace.diagnostics.read",
          "ace.pace.diagnostics.manage",
          "ace.behaviour.read",
          "ace.behaviour.record",
          "ace.behaviour.policy.manage",
          "ace.reports.read",
          "ace.reports.review",
          "ace.reports.publish",
          "ace.faith.read",
          "ace.faith.manage",
          "ace.faith.publish",
          "ace.community.read",
          "ace.community.report",
          "ace.community.spaces.manage",
          "ace.community.settings.manage",
          "ace.community.moderate",
          "school.trips.read",
          "school.trips.manage",
          "school.permission_slips.read",
          "school.permission_slips.manage",
        ],
      },
      siteLead: {
        name: "Site Lead",
        scope: "site",
        protected: true,
        permissions: [
          "attendance.read",
          "attendance.manage",
          "ace.attendance.export",
          "messaging.conversations.read",
          "messaging.conversations.create",
          "messaging.messages.read",
          "messaging.messages.send",
          "notices.read",
          "notices.manage",
          "notices.publish",
          "safeguarding.concerns.record",
          "students.manage",
          "classes.manage",
          "parents.read",
          "reports.read",
          "children.manage",
          "members.manage",
          "volunteers.manage",
          "giving.manage",
          "calendar.read",
          "ace.dashboard.read",
          "ace.settings.read",
          "ace.settings.manage",
          "ace.pace.read",
          "ace.pace.record",
          "ace.pace.correct",
          "ace.pace.override",
          "ace.pace.inventory.read",
          "ace.pace.inventory.manage",
          "ace.pace.diagnostics.read",
          "ace.pace.diagnostics.manage",
          "ace.behaviour.read",
          "ace.behaviour.record",
          "ace.behaviour.policy.manage",
          "ace.reports.read",
          "ace.reports.compile",
          "ace.reports.review",
          "ace.reports.publish",
          "ace.faith.read",
          "ace.faith.manage",
          "ace.faith.publish",
          "ace.community.read",
          "ace.community.report",
          "ace.community.spaces.manage",
          "ace.community.moderate",
          "school.trips.read",
          "school.trips.manage",
          "school.permission_slips.read",
          "school.permission_slips.manage",
        ],
      },
      staff: {
        name: "Staff",
        scope: "site",
        protected: true,
        permissions: [
          "attendance.read",
          "attendance.manage",
          "messaging.conversations.read",
          "messaging.conversations.create",
          "messaging.messages.read",
          "messaging.messages.send",
          "notices.read",
          "safeguarding.concerns.record",
          "ace.settings.read",
          "ace.pace.read",
          "ace.pace.record",
          "ace.behaviour.read",
          "ace.behaviour.record",
          "ace.reports.read",
          "ace.reports.compile",
          "ace.reports.review",
          "ace.faith.read",
          "ace.faith.manage",
          "ace.community.read",
          "ace.community.post",
          "ace.community.report",
          "school.trips.read",
          "school.trips.manage",
          "school.permission_slips.read",
          "school.permission_slips.manage",
        ],
      },
      safeguardingLead: {
        name: "Safeguarding Lead",
        scope: "site",
        protected: true,
        permissions: [
          "safeguarding.concerns.record",
          "safeguarding.concerns.read",
          "safeguarding.concerns.manage",
          "attendance.read",
          "notices.read",
          "ace.behaviour.read",
        ],
      },
      financeOperator: {
        name: "Finance Operator",
        scope: "organisation",
        protected: true,
        permissions: [
          "finance.invoices",
          "finance.payments",
          "finance.reports",
          "finance.family_invoices.read",
          "finance.family_invoices.manage",
          "finance.family_payments.record",
          "finance.family_reports.read",
        ],
      },
      parent: {
        name: "Parent",
        scope: "relationship",
        protected: true,
        permissions: [
          "messaging.conversations.read",
          "messaging.conversations.create",
          "messaging.messages.read",
          "messaging.messages.send",
          "finance.family_invoices.read",
          "ace.parent.progress.read",
          "ace.parent.notices.read",
          "ace.faith.read",
          "ace.faith.reflect",
          "school.permission_slips.read",
          "school.permission_slips.respond",
        ],
      },
      student: {
        name: "Student",
        scope: "relationship",
        protected: true,
        permissions: [
          "messaging.conversations.read",
          "messaging.messages.read",
          "messaging.messages.send",
          "ace.student.self.read",
          "ace.faith.read",
          "ace.faith.reflect",
          "ace.community.read",
          "ace.community.post",
          "ace.community.report",
        ],
      },
    });
  });

  it("grants dashboard access only to organisation and site leaders", () => {
    expect(SYSTEM_ROLE_TEMPLATES.organisationHead.permissions).toContain(
      "ace.dashboard.read",
    );
    expect(SYSTEM_ROLE_TEMPLATES.siteLead.permissions).toContain(
      "ace.dashboard.read",
    );
    expect(SYSTEM_ROLE_TEMPLATES.staff.permissions).not.toContain(
      "ace.dashboard.read",
    );
  });

  it("reserves ACE attendance export for leaders or an explicit access tag", () => {
    expect(SYSTEM_ROLE_TEMPLATES.organisationHead.permissions).toContain(
      "ace.attendance.export",
    );
    expect(SYSTEM_ROLE_TEMPLATES.siteLead.permissions).toContain(
      "ace.attendance.export",
    );
    for (const key of [
      "staff",
      "safeguardingLead",
      "parent",
      "student",
    ] as const) {
      expect(SYSTEM_ROLE_TEMPLATES[key].permissions).not.toContain(
        "ace.attendance.export",
      );
    }
  });

  it("keeps parent notice reading on the relationship role without site notice access", () => {
    expect(SYSTEM_ROLE_TEMPLATES.parent.permissions).toContain(
      "ace.parent.notices.read",
    );
    expect(SYSTEM_ROLE_TEMPLATES.parent.permissions).not.toContain(
      "notices.read",
    );
    expect(SYSTEM_ROLE_TEMPLATES.student.permissions).not.toContain(
      "ace.parent.notices.read",
    );
  });

  it("gives every template except financeOperator at least one core (vertical-independent) permission", () => {
    const coreSet = new Set(CORE_PERMISSIONS);
    for (const [key, template] of Object.entries(SYSTEM_ROLE_TEMPLATES)) {
      if (key === "financeOperator") continue;
      const hasCore = template.permissions.some((permission) =>
        coreSet.has(permission),
      );
      expect(hasCore).toBe(true);
    }
  });

  it("keeps relationship-scoped templates free of non-relationship-only core keys", () => {
    // Silent-drop trap: seedSystemRoles filters each template's permissions by
    // roleScopeAcceptsPermissionScope(template.scope, permissionScope), and a
    // relationship-scoped role accepts ONLY relationship-scoped permissions.
    // Site/org-scoped core keys (attendance.*, notices.*, safeguarding.concerns.*)
    // would silently vanish from parent/student at seed time if added here.
    const siteOrOrgOnlyCore = [
      "attendance.read",
      "attendance.manage",
      "ace.attendance.export",
      "notices.read",
      "notices.manage",
      "notices.publish",
      "safeguarding.concerns.record",
      "safeguarding.concerns.read",
      "safeguarding.concerns.manage",
    ];
    for (const key of ["parent", "student"] as const) {
      const permissions = SYSTEM_ROLE_TEMPLATES[key].permissions;
      for (const forbidden of siteOrOrgOnlyCore) {
        expect(permissions).not.toContain(forbidden);
      }
    }
  });
});
