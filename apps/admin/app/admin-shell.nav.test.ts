import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SidebarNav } from "@pathway/ui";
import { resolveAdminNavItems } from "./admin-navigation";

const navigationSource = readFileSync(
  new URL("./admin-navigation.ts", import.meta.url),
  "utf8",
);
const sidebarNavSource = readFileSync(
  new URL(
    "../../../packages/ui/src/components/sidebar-nav.tsx",
    import.meta.url,
  ),
  "utf8",
);

// Every nav destination must point at a distinct icon - regression test for the bug
// where several items (Guest pass/Handover/Handover logs/Attendance, Profile/People,
// Blog/Lessons) shared an iconIndex, and Settings pointed past the end of the array.
const iconIndexes = [...navigationSource.matchAll(/iconIndex:\s*(\d+)/g)].map(
  (m) => Number(m[1]),
);
assert.ok(
  iconIndexes.length > 0,
  "expected nav items with iconIndex to be found",
);
assert.equal(
  new Set(iconIndexes).size,
  iconIndexes.length,
  "every admin nav item must use a unique iconIndex",
);

const iconComponentsMatch = sidebarNavSource.match(
  /const iconComponents: LucideIcon\[\] = \[([\s\S]*?)\];/,
);
assert.ok(
  iconComponentsMatch,
  "expected an iconComponents array in sidebar-nav.tsx",
);
const iconNames = iconComponentsMatch![1]
  .split("\n")
  .map((line) => line.split("//")[0].replace(",", "").trim())
  .filter(Boolean);
assert.equal(
  new Set(iconNames).size,
  iconNames.length,
  "iconComponents must not repeat the same icon for two different indices",
);

const maxIconIndex = Math.max(...iconIndexes);
assert.ok(
  maxIconIndex < iconNames.length,
  `iconComponents (${iconNames.length} entries) must cover the highest iconIndex used (${maxIconIndex})`,
);

const learningNavEntry = navigationSource.match(
  /label:\s*"Learning"[\s\S]*?href:\s*"\/learning"[\s\S]*?iconIndex:\s*(\d+)[\s\S]*?access:\s*"staff-or-admin"[\s\S]*?capability:\s*"learning\.log\.read"[\s\S]*?group:\s*"Teaching"/,
);
assert.ok(
  learningNavEntry,
  "expected Learning navigation to require the learning.log.read capability",
);
assert.ok(
  Number(learningNavEntry[1]) < iconNames.length,
  "Learning navigation iconIndex must be covered by iconComponents",
);

const paceNavEntry = navigationSource.match(
  /label:\s*"PACE"[\s\S]*?href:\s*"\/ace\/pace"[\s\S]*?access:\s*"staff-or-admin"[\s\S]*?permission:\s*"ace\.pace\.read"[\s\S]*?group:\s*"Teaching",?\s*\},/,
);
assert.ok(
  paceNavEntry,
  "expected PACE navigation to require the ace.pace.read permission",
);

const academicSetupNavEntry = navigationSource.match(
  /label:\s*"Academic setup"[\s\S]*?href:\s*"\/ace\/settings\/academic"[\s\S]*?permission:\s*"ace\.settings\.read"[\s\S]*?group:\s*"Teaching",?\s*\},/,
);
assert.ok(
  academicSetupNavEntry,
  "expected ACE academic setup navigation to require ace.settings.read",
);

const staffRole = {
  isOrgAdmin: false,
  isOrgOwner: false,
  isSiteAdmin: false,
  isStaff: true,
  isSafeguardingStaff: false,
  isSuperUser: false,
};
const renderNavigation = (permissions: string[]) =>
  renderToStaticMarkup(
    React.createElement(SidebarNav, {
      currentPath: "/ace/behaviour",
      items: resolveAdminNavItems({
        role: staffRole,
        currentOrgIsMasterOrg: false,
        capabilities: [],
        permissions,
        ui: { labels: {} },
      }),
    }),
  );
assert.doesNotMatch(
  renderNavigation([]),
  /href="\/ace\/behaviour"/,
  "Behaviour navigation stays hidden without ace.behaviour.read",
);
assert.match(
  renderNavigation(["ace.behaviour.read"]),
  /href="\/ace\/behaviour"[^>]*>[\s\S]*?Behaviour/,
  "Behaviour navigation renders after ace.behaviour.read is loaded",
);
const academicSetupNavigation = (permissions: string[]) =>
  resolveAdminNavItems({
    role: staffRole,
    currentOrgIsMasterOrg: false,
    capabilities: [],
    permissions,
    ui: { labels: {} },
  }).some((item) => item.href === "/ace/settings/academic");
assert.equal(academicSetupNavigation([]), false);
assert.equal(academicSetupNavigation(["ace.settings.read"]), true);
const messagingNavigation = (permissions: string[]) =>
  resolveAdminNavItems({
    role: staffRole,
    currentOrgIsMasterOrg: false,
    capabilities: [],
    permissions,
    ui: { labels: {} },
  }).some((item) => item.href === "/ace/messages");
assert.equal(
  messagingNavigation(["messaging.conversations.read"]),
  false,
  "messages navigation needs both conversation and message read permissions",
);
assert.equal(
  messagingNavigation([
    "messaging.conversations.read",
    "messaging.messages.read",
  ]),
  true,
  "messages navigation appears for staff with both read permissions",
);

// ACE-F14: Roles & Access must be gated by the typed permission, not a role
// display name - no `access:` string on this entry.
const rolesAccessNavEntry = navigationSource.match(
  /label:\s*"Roles & Access"[\s\S]*?href:\s*"\/settings\/roles"[\s\S]*?capability:\s*"platform\.access\.roles\.read"[\s\S]*?permission:\s*"platform\.access\.roles\.read"[\s\S]*?group:\s*"Admin",?\s*\},/,
);
assert.ok(
  rolesAccessNavEntry,
  "expected Roles & Access navigation to require the platform.access.roles.read capability and permission",
);
assert.ok(
  !rolesAccessNavEntry![0].includes("access:"),
  "Roles & Access must not authorise from a role-name access requirement",
);

// Production-403 fix: Attendance and Notices are gated by their typed
// permission too, not just the coarse role-name access requirement, so a
// user without attendance.read/notices.read doesn't even see the link.
const attendanceNavEntry = navigationSource.match(
  /defaultSidebarItems\[8\][\s\S]*?access:\s*"staff-or-admin"[\s\S]*?permission:\s*"attendance\.read"[\s\S]*?group:\s*"Schedule",?\s*\},/,
);
assert.ok(
  attendanceNavEntry,
  "expected Attendance navigation to require the attendance.read permission",
);

const noticesNavEntry = navigationSource.match(
  /defaultSidebarItems\[9\][\s\S]*?access:\s*"site-admin-or-higher"[\s\S]*?permission:\s*"notices\.read"[\s\S]*?group:\s*"Communication",?\s*\},/,
);
assert.ok(
  noticesNavEntry,
  "expected Notices & Announcements navigation to require the notices.read permission",
);

// Grouped items render as accordion sections; Dashboard stays top-level.
const groupLabels = [...navigationSource.matchAll(/group:\s*"([^"]+)"/g)].map(
  (m) => m[1],
);
assert.ok(
  groupLabels.length > 0,
  "expected nav items to declare accordion groups",
);
assert.match(
  navigationSource,
  /\{ \.\.\.defaultSidebarItems\[0\], access: "staff-or-admin" \},/,
  "Dashboard has no group",
);

console.log("admin-shell nav icon/group checks passed");
