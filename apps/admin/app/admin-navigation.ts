import type { Capability, PermissionKey } from "@pathway/platform";
import { defaultSidebarItems, type SidebarNavItem } from "@pathway/ui";
import {
  hasCapability,
  hasPermission,
  meetsAccessRequirement,
  type AccessRequirement,
  type AdminRoleInfo,
} from "@/lib/access";
import { orgLabel, type OrgUi } from "@/lib/org-ui";

// Define access requirements for each nav item.
// Staff (no admin): Profile, Children, Parents, Lessons, Sessions, My schedule, Attendance, Create concern.
// Site/Org admin: People, Classes, Announcements, Safeguarding (view), Reports, Settings.
// Org admin only: Billing.
//
// `group` clusters related items into a collapsible accordion section in the sidebar;
// items without a `group` (Dashboard) render as top-level links above the sections.
const navItemsWithAccess: (SidebarNavItem & {
  access?: AccessRequirement;
  capability?: Capability;
  permission?: PermissionKey;
  additionalPermission?: PermissionKey;
})[] = [
  { ...defaultSidebarItems[0], access: "staff-or-admin" }, // Dashboard
  {
    label: "Profile",
    href: "/staff/profile",
    iconIndex: 14,
    access: "staff-only",
    group: "People",
  }, // Staff only (replaces People)
  {
    ...defaultSidebarItems[1],
    access: "site-admin-or-higher",
    group: "People",
  }, // People (admins only)
  { ...defaultSidebarItems[2], access: "staff-or-admin", group: "People" }, // Children
  { ...defaultSidebarItems[3], access: "staff-or-admin", group: "People" }, // Parents & Guardians
  { ...defaultSidebarItems[4], access: "staff-or-admin", group: "Teaching" }, // Lessons
  {
    ...defaultSidebarItems[5],
    access: "site-admin-or-higher",
    group: "Teaching",
  }, // Classes (admins only)
  {
    label: "Learning",
    href: "/learning",
    iconIndex: 20,
    access: "staff-or-admin",
    capability: "learning.log.read",
    group: "Teaching",
  },
  {
    label: "ACE overview",
    href: "/ace",
    matchMode: "exact",
    iconIndex: 24,
    access: "staff-or-admin",
    permission: "ace.dashboard.read",
    group: "Teaching",
  },
  {
    label: "PACE",
    href: "/ace/pace",
    iconIndex: 22,
    access: "staff-or-admin",
    permission: "ace.pace.read",
    group: "Teaching",
  },
  {
    label: "Academic setup",
    href: "/ace/settings/academic",
    iconIndex: 27,
    access: "staff-or-admin",
    permission: "ace.settings.read",
    group: "Teaching",
  },
  {
    label: "PACE inventory",
    href: "/ace/pace/inventory",
    iconIndex: 25,
    access: "staff-or-admin",
    permission: "ace.pace.inventory.read",
    group: "Teaching",
  },
  {
    label: "Behaviour",
    href: "/ace/behaviour",
    iconIndex: 23,
    access: "staff-or-admin",
    permission: "ace.behaviour.read",
    group: "Teaching",
  },
  { ...defaultSidebarItems[6], access: "staff-or-admin", group: "Schedule" }, // Sessions & Rota
  { ...defaultSidebarItems[7], access: "staff-or-admin", group: "Schedule" }, // My schedule
  {
    ...defaultSidebarItems[8],
    access: "staff-or-admin",
    permission: "attendance.read",
    group: "Schedule",
  }, // Attendance
  {
    label: "Daily register",
    href: "/ace/attendance/daily",
    iconIndex: 28,
    access: "staff-or-admin",
    capability: "ace.dashboard.read",
    permission: "attendance.read",
    group: "Schedule",
  },
  {
    ...defaultSidebarItems[9],
    access: "staff-or-admin",
    permission: "notices.read",
    group: "Communication",
  }, // Shared site notices
  {
    label: "Messages",
    href: "/ace/messages",
    iconIndex: 26,
    access: "staff-or-admin",
    permission: "messaging.conversations.read",
    additionalPermission: "messaging.messages.read",
    group: "Communication",
  },
  {
    label: "Guest pass",
    href: "/guest-pass",
    iconIndex: 15,
    access: "staff-or-admin",
    group: "Guest & Handover",
  },
  {
    label: "Handover",
    href: "/handover",
    iconIndex: 16,
    access: "staff-or-admin",
    group: "Guest & Handover",
  },
  {
    label: "Handover logs",
    href: "/admin/handover",
    iconIndex: 17,
    access: "site-admin-or-higher",
    group: "Guest & Handover",
  },
  {
    label: "Create concern",
    href: "/safeguarding/concerns/new",
    iconIndex: 18,
    access: "staff-or-admin",
    group: "Safeguarding",
  }, // All staff can create
  {
    ...defaultSidebarItems[10],
    access: "safeguarding-admin",
    group: "Safeguarding",
  }, // Safeguarding (view dashboard)
  { ...defaultSidebarItems[11], access: "billing", group: "Admin" }, // Billing (org admin only)
  {
    label: "Blog",
    href: "/admin/blog",
    iconIndex: 19,
    access: "super-user",
    group: "Communication",
  },
  { ...defaultSidebarItems[12], access: "admin-only", group: "Admin" }, // Reports
  { ...defaultSidebarItems[13], access: "admin-only", group: "Admin" }, // Settings
  {
    label: "Roles & Access",
    href: "/settings/roles",
    iconIndex: 21,
    capability: "platform.access.roles.read",
    permission: "platform.access.roles.read",
    group: "Admin",
  },
];

export function resolveAdminNavItems({
  role,
  currentOrgIsMasterOrg,
  capabilities,
  permissions,
  ui,
}: {
  role: AdminRoleInfo;
  currentOrgIsMasterOrg: boolean;
  capabilities: string[];
  permissions: string[] | null;
  ui: OrgUi;
}): SidebarNavItem[] {
  return navItemsWithAccess
    .filter(
      (item) =>
        meetsAccessRequirement(role, item.access, {
          currentOrgIsMasterOrg,
        }) &&
        hasCapability(capabilities, item.capability) &&
        hasPermission(permissions, item.permission) &&
        hasPermission(permissions, item.additionalPermission),
    )
    .map((item) => ({ ...item, label: orgLabel(ui, item.href, item.label) }));
}
