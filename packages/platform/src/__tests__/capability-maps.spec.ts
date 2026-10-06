import { Vertical, Module } from "@prisma/client";
import { VERTICAL_CAPABILITIES, MODULE_CAPABILITIES } from "../capability-maps";

const PLATFORM_CORE_KEYS = [
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
] as const;

const ACE_LEARNING_KEYS = [
  "learning.log.read",
  "learning.log.write",
  "learning.evidence.read",
  "learning.evidence.write",
  "learning.reports.generate",
] as const;

const ACE_CORE_KEYS = [
  "ace.settings.read",
  "ace.settings.manage",
  "ace.pace.read",
  "ace.pace.record",
  "ace.pace.correct",
  "ace.pace.override",
  "ace.pace.inventory.read",
  "ace.pace.inventory.manage",
  "ace.behaviour.read",
  "ace.behaviour.record",
  "ace.behaviour.sensitive.read",
  "ace.behaviour.policy.manage",
  "ace.reports.read",
  "ace.reports.compile",
  "ace.reports.review",
  "ace.reports.publish",
  "ace.parent.progress.read",
  "ace.student.self.read",
  "ace.faith.read",
  "ace.faith.manage",
  "ace.faith.publish",
  "ace.faith.reflect",
  "ace.community.read",
  "ace.community.post",
  "ace.community.report",
  "ace.community.spaces.manage",
  "ace.community.settings.manage",
  "ace.community.moderate",
] as const;

const SCHOOL_OPERATIONS_KEYS = [
  "school.trips.read",
  "school.trips.manage",
  "school.permission_slips.read",
  "school.permission_slips.manage",
  "school.permission_slips.respond",
] as const;

describe("capability maps completeness", () => {
  it("every vertical grants at least one capability", () => {
    for (const v of Object.values(Vertical)) {
      expect(VERTICAL_CAPABILITIES[v]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("every module grants at least one capability", () => {
    for (const m of Object.values(Module)) {
      expect(MODULE_CAPABILITIES[m]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("gives the Learning module its learning capabilities", () => {
    expect(MODULE_CAPABILITIES.LEARNING).toEqual(ACE_LEARNING_KEYS);
  });

  it("makes platform-core capabilities available to every vertical", () => {
    for (const vertical of Object.values(Vertical)) {
      expect(VERTICAL_CAPABILITIES[vertical]).toEqual(
        expect.arrayContaining(PLATFORM_CORE_KEYS),
      );
    }
  });

  it("gives ACE its core, school-operations, and Learning capabilities", () => {
    expect(VERTICAL_CAPABILITIES.ACE_SCHOOL).toEqual(
      expect.arrayContaining([
        ...ACE_CORE_KEYS,
        ...SCHOOL_OPERATIONS_KEYS,
        ...ACE_LEARNING_KEYS,
      ]),
    );
  });

  it("maps Finance and Advanced Reporting keys to their real modules", () => {
    expect(MODULE_CAPABILITIES.FINANCE).toEqual(
      expect.arrayContaining([
        "finance.family_invoices.read",
        "finance.family_invoices.manage",
        "finance.family_payments.record",
        "finance.family_reports.read",
      ]),
    );
    expect(MODULE_CAPABILITIES.ADVANCED_REPORTING).toEqual(
      expect.arrayContaining(["advanced_reporting.ace.multisite.read"]),
    );
  });

  it("leaves Clubs and Merit ungranted until their enum support exists", () => {
    const grantedCapabilities = [
      ...Object.values(VERTICAL_CAPABILITIES).flat(),
      ...Object.values(MODULE_CAPABILITIES).flat(),
    ];

    expect(grantedCapabilities).not.toContain("clubs.read");
    expect(grantedCapabilities).not.toContain("merit.wallet.read");
  });
});
