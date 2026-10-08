import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { SYSTEM_ROLE_TEMPLATES } from "@pathway/auth";
import type { Prisma } from "@pathway/db";

export interface DailyAttendanceActor {
  tenantId: string;
  orgId: string;
  userId: string;
}

export interface DailyAttendanceAccess {
  timezone: string | null;
  bands: Array<{ id: string; name: string }>;
}

interface DailyAttendanceRoleScope {
  timezone: string | null;
  leader: boolean;
}

export async function resolveDailyAttendanceAccess(
  tx: Prisma.TransactionClient,
  actor: DailyAttendanceActor,
  date: Date,
  permission: "attendance.read" | "attendance.manage",
): Promise<DailyAttendanceAccess> {
  const { timezone, leader } = await resolveDailyAttendanceRoleScope(
    tx,
    actor,
    permission,
  );
  const assignments = leader
    ? []
    : await tx.aceStaffYearBandAssignment.findMany({
        where: {
          tenantId: actor.tenantId,
          userId: actor.userId,
          startsOn: { lte: date },
          OR: [{ endsOn: null }, { endsOn: { gte: date } }],
        },
        select: { yearBandId: true },
      });
  const permittedBandIds = [
    ...new Set(assignments.map((row) => row.yearBandId)),
  ];
  const bands = await tx.aceYearBand.findMany({
    where: {
      tenantId: actor.tenantId,
      ...(leader ? {} : { id: { in: permittedBandIds } }),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
    select: { id: true, name: true },
  });
  return { timezone, bands };
}

export async function resolveDailyAttendanceExportScope(
  tx: Prisma.TransactionClient,
  actor: DailyAttendanceActor,
  from: Date,
  to: Date,
): Promise<{
  leader: boolean;
  assignments: Array<{
    yearBandId: string;
    startsOn: Date;
    endsOn: Date | null;
  }>;
}> {
  const { leader } = await resolveDailyAttendanceRoleScope(
    tx,
    actor,
    "ace.attendance.export",
  );
  const assignments = leader
    ? []
    : await tx.aceStaffYearBandAssignment.findMany({
        where: {
          tenantId: actor.tenantId,
          userId: actor.userId,
          startsOn: { lte: to },
          OR: [{ endsOn: null }, { endsOn: { gte: from } }],
        },
        select: { yearBandId: true, startsOn: true, endsOn: true },
      });
  return { leader, assignments };
}

async function resolveDailyAttendanceRoleScope(
  tx: Prisma.TransactionClient,
  actor: DailyAttendanceActor,
  permission: "attendance.read" | "attendance.manage" | "ace.attendance.export",
): Promise<DailyAttendanceRoleScope> {
  if (!actor.tenantId || !actor.orgId || !actor.userId) {
    throw new BadRequestException("An active site is required");
  }

  const [site, user, orgMembership, siteMembership] = await Promise.all([
    tx.tenant.findFirst({
      where: { id: actor.tenantId, orgId: actor.orgId },
      select: { timezone: true },
    }),
    tx.user.findFirst({
      where: { id: actor.userId, isActive: true },
      select: { id: true },
    }),
    tx.orgMembership.findUnique({
      where: { orgId_userId: { orgId: actor.orgId, userId: actor.userId } },
      select: { id: true },
    }),
    tx.siteMembership.findUnique({
      where: {
        tenantId_userId: { tenantId: actor.tenantId, userId: actor.userId },
      },
      select: { id: true },
    }),
  ]);
  if (!site) throw new NotFoundException("Site not found");
  if (!user || !orgMembership) {
    throw new ForbiddenException("Permission denied");
  }

  const leaderScopes: Prisma.UserRoleAssignmentWhereInput[] = [
    {
      tenantId: null,
      roleDefinition: {
        name: SYSTEM_ROLE_TEMPLATES.organisationHead.name,
        scope: "organisation",
        tenantId: null,
      },
    },
  ];
  if (siteMembership) {
    leaderScopes.push({
      tenantId: actor.tenantId,
      roleDefinition: {
        name: SYSTEM_ROLE_TEMPLATES.siteLead.name,
        scope: "site",
        tenantId: actor.tenantId,
      },
    });
  }
  const now = new Date();
  const leader = await tx.userRoleAssignment.findFirst({
    where: {
      orgId: actor.orgId,
      userId: actor.userId,
      startsAt: { lte: now },
      revokedAt: null,
      roleDefinition: {
        orgId: actor.orgId,
        isSystem: true,
        isActive: true,
        permissions: {
          some: {
            permissionKey: permission,
            permission: { isActive: true },
          },
        },
      },
      AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        { OR: leaderScopes },
      ],
    },
    select: { id: true },
  });
  if (!leader && !siteMembership) {
    throw new ForbiddenException("Permission denied");
  }
  return { timezone: site.timezone, leader: Boolean(leader) };
}
