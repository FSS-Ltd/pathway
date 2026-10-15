import type { Prisma } from "@pathway/db";
import type { ComplianceActor } from "./compliance.service";
import { resolveDailyAttendanceRoleScope } from "../attendance/daily-attendance-access";
export interface SignalObservation {
  count: number;
  missingCount: number | null;
  description: string;
  href: string | null;
}
export async function attendanceSignal(
  tx: Prisma.TransactionClient,
  actor: ComplianceActor,
  now: Date,
): Promise<SignalObservation | null> {
  const access = await resolveDailyAttendanceRoleScope(
    tx,
    actor,
    "attendance.read",
  );
  if (!access.leader) return null;
  const since = new Date(now.getTime() - 30 * 86400000);
  const [sessionRecords, dailyRecords] = await Promise.all([
    tx.attendance.count({
      where: {
        child: { tenantId: actor.tenantId },
        timestamp: { gte: since, lte: now },
      },
    }),
    tx.aceDailyAttendance.count({
      where: { tenantId: actor.tenantId, date: { gte: since, lte: now } },
    }),
  ]);
  return {
    count: sessionRecords + dailyRecords,
    missingCount: null,
    description:
      "Session and daily attendance records in the last 30 days. This does not establish register completeness.",
    href: "/attendance",
  };
}
export async function tripSignal(
  tx: Prisma.TransactionClient,
  actor: ComplianceActor,
  now: Date,
): Promise<SignalObservation> {
  const where: Prisma.PermissionSlipRecipientWhereInput = {
    tenantId: actor.tenantId,
    permissionSlipVersion: {
      publishedAt: { not: null },
      supersededBy: { none: { publishedAt: { not: null } } },
      permissionSlip: {
        trip: {
          tenantId: actor.tenantId,
          cancelledAt: null,
          endsAt: { gte: now },
        },
      },
    },
  };
  const [count, missingCount] = await Promise.all([
    tx.permissionSlipRecipient.count({ where }),
    tx.permissionSlipRecipient.count({
      where: { ...where, responses: { none: {} }, exceptions: { none: {} } },
    }),
  ]);
  return {
    count,
    missingCount,
    description:
      "Current permission requests for upcoming or ongoing trips; gaps have no response or recorded exception. Responses are not proof of permission to proceed.",
    href: null,
  };
}
export async function aceSignal(
  tx: Prisma.TransactionClient,
  actor: ComplianceActor,
  now: Date,
): Promise<SignalObservation> {
  const count = await tx.pacePolicy.count({
    where: {
      tenantId: actor.tenantId,
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
    },
  });
  return {
    count,
    missingCount: count ? 0 : 1,
    description:
      "Current PACE policies recorded in academic settings. These records do not confirm ACE or ICCE registration or external approval.",
    href: "/ace/settings/academic",
  };
}
