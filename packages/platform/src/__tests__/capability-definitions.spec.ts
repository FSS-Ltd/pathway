import { Module, Vertical } from "@prisma/client";
import {
  CAPABILITY_DEFINITIONS,
  type Capability,
  type PermissionKey,
} from "../capability-definitions";
import { MODULE_CAPABILITIES, VERTICAL_CAPABILITIES } from "../capability-maps";

type Assert<T extends true> = T;
type AssertFalse<T extends false> = T;
type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false;

type KnownKeyRemainsAssignable = Assert<
  "ace.pace.read" extends Capability ? true : false
>;
type UnknownKeyIsRejected = AssertFalse<
  "unknown.capability" extends Capability ? true : false
>;
type PermissionKeyMatchesCapability = Assert<Equal<PermissionKey, Capability>>;

const compileTimeAssertions: [
  KnownKeyRemainsAssignable,
  UnknownKeyIsRejected,
  PermissionKeyMatchesCapability,
] = [true, false, true];
void compileTimeAssertions;

const LEGACY_MAP_KEYS = [
  "attendance.read",
  "attendance.manage",
  "volunteers.manage",
  "giving.manage",
  "calendar.read",
  "students.manage",
  "classes.manage",
  "parents.read",
  "reports.read",
  "pace.manage",
  "children.manage",
  "members.manage",
  "finance.invoices",
  "finance.payments",
  "finance.reports",
  "events.booking",
  "events.manage",
  "transport.routes",
  "transport.manage",
  "meals.manage",
  "meals.orders",
  "assets.manage",
  "assets.audit",
  "hr.staff",
  "hr.leave",
  "ai.workspace",
  "reporting.advanced",
  "learning.log.read",
  "learning.log.write",
  "learning.evidence.read",
  "learning.evidence.write",
  "learning.reports.generate",
] as const;

const SECTION_5_2_KEYS = [
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
  "ace.behaviour.sensitive.read",
  "ace.behaviour.policy.manage",
  "ace.reports.read",
  "ace.reports.compile",
  "ace.reports.review",
  "ace.reports.publish",
  "ace.parent.progress.read",
  "ace.student.self.read",
  "ace.faith.read",
  "ace.faith.publish",
  "ace.faith.manage",
  "ace.community.read",
  "ace.community.post",
  "ace.community.spaces.manage",
  "ace.community.moderate",
  "school.trips.read",
  "school.trips.manage",
  "school.permission_slips.read",
  "school.permission_slips.manage",
  "school.permission_slips.respond",
  "learning.log.read",
  "learning.log.write",
  "learning.evidence.read",
  "learning.evidence.write",
  "learning.reports.generate",
  "clubs.read",
  "clubs.manage",
  "clubs.signup.manage",
  "clubs.attendance.record",
  "clubs.leads.manage",
  "finance.family_invoices.read",
  "finance.family_invoices.manage",
  "finance.family_payments.record",
  "finance.family_reports.read",
  "merit.wallet.read",
  "merit.wallet.adjust",
  "merit.wallet.transfer",
  "merit.tithe.manage",
  "merit.shop.read",
  "merit.shop.manage",
  "merit.shop.purchase",
  "merit.market.read",
  "merit.market.trade",
  "merit.leaderboards.read",
  "advanced_reporting.ace.multisite.read",
] as const;

const ADDITIONAL_MATRIX_KEYS = [
  "platform.access.roles.read",
  "platform.access.roles.manage",
  "platform.access.permissions.read",
  "platform.access.assignments.read",
  "platform.access.assignments.manage",
  "platform.access.users.read",
  "platform.access.audit.read",
  "ace.faith.reflect",
  "ace.community.settings.manage",
  "ace.community.report",
  "family.activities.read",
  "family.activities.write",
  "family.tasks.read",
  "family.tasks.write",
  "family.calendar.read",
  "family.calendar.write",
  "family.regulations.read",
  "family.regulations.write",
] as const;

const NEW_PLATFORM_CORE_KEYS = [
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

const APPROVED_REGISTRY_KEYS = [
  ...new Set([
    ...LEGACY_MAP_KEYS,
    ...SECTION_5_2_KEYS,
    ...ADDITIONAL_MATRIX_KEYS,
    ...NEW_PLATFORM_CORE_KEYS,
  ]),
];

describe("capability definitions", () => {
  it("contains exactly the 113 approved registry keys", () => {
    expect(APPROVED_REGISTRY_KEYS).toHaveLength(113);
    expect(Object.keys(CAPABILITY_DEFINITIONS).sort()).toEqual(
      [...APPROVED_REGISTRY_KEYS].sort(),
    );
  });

  it.each(APPROVED_REGISTRY_KEYS)("registers %s", (capability) => {
    expect(
      Object.prototype.hasOwnProperty.call(CAPABILITY_DEFINITIONS, capability),
    ).toBe(true);
  });

  it("defines every capability granted by a vertical or module", () => {
    const grantedCapabilities = [
      ...Object.values(VERTICAL_CAPABILITIES).flat(),
      ...Object.values(MODULE_CAPABILITIES).flat(),
    ];

    for (const capability of grantedCapabilities) {
      expect(
        Object.prototype.hasOwnProperty.call(
          CAPABILITY_DEFINITIONS,
          capability,
        ),
      ).toBe(true);
    }
  });

  it("grants ACE schools the dashboard capability", () => {
    expect(VERTICAL_CAPABILITIES.ACE_SCHOOL).toContain("ace.dashboard.read");
  });

  it("uses high-water sensitivity and the approved delegation policy", () => {
    expect(CAPABILITY_DEFINITIONS["ace.faith.read"].sensitivity).toBe(
      "sensitive",
    );
    expect(
      CAPABILITY_DEFINITIONS["school.permission_slips.manage"].sensitivity,
    ).toBe("protected");
    expect(CAPABILITY_DEFINITIONS["ace.reports.publish"].delegable).toBe(true);
    expect(CAPABILITY_DEFINITIONS["ace.community.moderate"].delegable).toBe(
      true,
    );

    for (const key of ADDITIONAL_MATRIX_KEYS.filter((key) =>
      key.startsWith("platform.access."),
    )) {
      expect(CAPABILITY_DEFINITIONS[key].delegable).toBe(false);
    }
    expect(CAPABILITY_DEFINITIONS["safeguarding.concerns.read"].delegable).toBe(
      false,
    );
    expect(
      CAPABILITY_DEFINITIONS["safeguarding.concerns.manage"].delegable,
    ).toBe(false);
    expect(
      CAPABILITY_DEFINITIONS["safeguarding.concerns.record"].delegable,
    ).toBe(true);
  });

  it("uses the most restrictive scope without replacing route checks", () => {
    expect(CAPABILITY_DEFINITIONS["ace.dashboard.read"]).toMatchObject({
      scope: "site",
      sensitivity: "standard",
      requiredVertical: Vertical.ACE_SCHOOL,
    });
    expect(CAPABILITY_DEFINITIONS["ace.parent.progress.read"].scope).toBe(
      "relationship",
    );
    expect(CAPABILITY_DEFINITIONS["ace.community.moderate"].scope).toBe(
      "assignment",
    );
    expect(CAPABILITY_DEFINITIONS["ace.community.settings.manage"].scope).toBe(
      "site",
    );
    expect(CAPABILITY_DEFINITIONS["messaging.messages.read"].scope).toBe(
      "relationship",
    );
    expect(CAPABILITY_DEFINITIONS["safeguarding.concerns.read"].scope).toBe(
      "assignment",
    );
  });

  it("records only unambiguous module and vertical requirements", () => {
    expect(
      CAPABILITY_DEFINITIONS["finance.family_invoices.read"].requiredModule,
    ).toBe(Module.FINANCE);
    expect(
      CAPABILITY_DEFINITIONS["advanced_reporting.ace.multisite.read"]
        .requiredModule,
    ).toBe(Module.ADVANCED_REPORTING);
    expect(CAPABILITY_DEFINITIONS["ace.pace.read"].requiredVertical).toBe(
      Vertical.ACE_SCHOOL,
    );
    expect(
      CAPABILITY_DEFINITIONS["ace.pace.inventory.manage"].requiredVertical,
    ).toBe(Vertical.ACE_SCHOOL);
    expect(
      CAPABILITY_DEFINITIONS["ace.pace.diagnostics.manage"].requiredVertical,
    ).toBe(Vertical.ACE_SCHOOL);

    for (const key of [
      "learning.log.read",
      "school.trips.read",
      "clubs.read",
      "merit.wallet.read",
    ] as const) {
      expect(CAPABILITY_DEFINITIONS[key]).not.toHaveProperty("requiredModule");
      expect(CAPABILITY_DEFINITIONS[key]).not.toHaveProperty(
        "requiredVertical",
      );
    }
  });

  it("declares no feature toggle until a real rollout source exists", () => {
    for (const definition of Object.values(CAPABILITY_DEFINITIONS)) {
      expect(definition.featureToggle).toBeUndefined();
    }
  });
});
