import { SYSTEM_ROLE_TEMPLATES } from "@pathway/auth";
import type { Prisma } from "@pathway/db";
import type { PermissionKey } from "@pathway/platform";
import type { TrackerSignalKey } from "@pathway/types";
import type { ComplianceActor } from "./compliance.service";
import { medicalField } from "./medical-record";
import {
  aceSignal,
  attendanceSignal,
  tripSignal,
  type SignalObservation,
} from "./tracker-signal-education";
export interface TrackerSignalReader {
  key: TrackerSignalKey;
  permissions: readonly PermissionKey[];
  read(
    tx: Prisma.TransactionClient,
    actor: ComplianceActor,
    now: Date,
  ): Promise<SignalObservation | null>;
}
async function personnel(
  tx: Prisma.TransactionClient,
  actor: ComplianceActor,
  now: Date,
): Promise<SignalObservation> {
  const where = {
    tenantId: actor.tenantId,
    orgId: actor.orgId,
    archivedAt: null,
  };
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const [count, missingCount] = await Promise.all([
    tx.compliancePersonnelRecord.count({ where }),
    tx.compliancePersonnelRecord.count({
      where: {
        ...where,
        OR: [{ status: { not: "VERIFIED" } }, { reviewDueOn: { lt: today } }],
      },
    }),
  ]);
  return {
    count,
    missingCount,
    description:
      "Active checks and training records; gaps are unverified or overdue for organisational review. No certificate expiry is inferred.",
    href: "/compliance/checks",
  };
}
async function agreements(
  tx: Prisma.TransactionClient,
  actor: ComplianceActor,
): Promise<SignalObservation> {
  const where = {
    tenantId: actor.tenantId,
    orgId: actor.orgId,
    supersededAt: null,
  };
  const [count, missingCount] = await Promise.all([
    tx.complianceAgreementAssignment.count({ where }),
    tx.complianceAgreementAssignment.count({
      where: { ...where, acceptance: null },
    }),
  ]);
  return {
    count,
    missingCount,
    description:
      "Current agreement assignments; gaps have no recorded acknowledgement or signed copy.",
    href: "/compliance/agreements",
  };
}
async function medical(
  tx: Prisma.TransactionClient,
  actor: ComplianceActor,
  now: Date,
): Promise<SignalObservation | null> {
  const where: Prisma.ChildWhereInput = {
    tenantId: actor.tenantId,
    OR: [{ isGuest: false }, { guestExpiresAt: { gt: now } }],
  };
  let count = 0;
  let missingCount = 0;
  let cursor: string | undefined;
  // Read bounded pages through the PII layer: raw non-null counts cannot establish
  // whether encrypted clinical information can actually be read.
  for (;;) {
    const rows = await tx.child.findMany({
      where: { ...where, ...(cursor ? { id: { gt: cursor } } : {}) },
      orderBy: { id: "asc" },
      take: 250,
      select: {
        id: true,
        allergies: true,
        allergiesConfirmedAt: true,
        medicalConditions: true,
        medicationAtSite: true,
      },
    });
    for (const row of rows) {
      const fields = [
        medicalField(row.allergies, row.allergiesConfirmedAt !== null),
        medicalField(row.medicalConditions, true),
        medicalField(row.medicationAtSite, true),
      ];
      if (fields.some((field) => field.status === "UNAVAILABLE")) return null;
      count++;
      if (
        row.allergiesConfirmedAt === null ||
        fields.some((field) => field.status === "UNKNOWN")
      )
        missingCount++;
    }
    if (rows.length < 250) break;
    cursor = rows[rows.length - 1].id;
  }
  return {
    count,
    missingCount,
    description:
      "Readable child medical records; gaps lack an allergy confirmation, medical-condition entry or medication entry. A recorded none is distinct from missing information.",
    href: "/compliance/medical",
  };
}
async function safeguarding(
  tx: Prisma.TransactionClient,
  actor: ComplianceActor,
  now: Date,
): Promise<SignalObservation> {
  const count = await tx.userRoleAssignment.count({
    where: {
      orgId: actor.orgId,
      tenantId: actor.tenantId,
      revokedAt: null,
      startsAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      user: { isActive: true },
      roleDefinition: {
        orgId: actor.orgId,
        tenantId: actor.tenantId,
        isActive: true,
        isSystem: true,
        name: SYSTEM_ROLE_TEMPLATES.safeguardingLead.name,
      },
    },
  });
  return {
    count,
    missingCount: count ? 0 : 1,
    description:
      "Active site safeguarding-lead role assignments. This does not assess training, policies or safeguarding concerns.",
    href: "/settings/roles",
  };
}
export const TRACKER_SIGNAL_READERS: readonly TrackerSignalReader[] = [
  {
    key: "personnel",
    permissions: ["compliance.checks.read"],
    read: personnel,
  },
  {
    key: "agreements",
    permissions: ["compliance.agreements.read"],
    read: agreements,
  },
  { key: "medical", permissions: ["compliance.medical.read"], read: medical },
  {
    key: "attendance",
    permissions: ["attendance.read"],
    read: attendanceSignal,
  },
  {
    key: "safeguarding",
    permissions: ["platform.access.roles.read"],
    read: safeguarding,
  },
  {
    key: "trips",
    permissions: ["school.trips.read", "school.permission_slips.manage"],
    read: tripSignal,
  },
  { key: "ace", permissions: ["ace.settings.read"], read: aceSignal },
];
