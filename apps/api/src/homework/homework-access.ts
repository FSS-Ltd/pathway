import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@pathway/db";
import type { CreateHomeworkDto } from "./dto/create-homework.dto";
import { siteCalendarDate } from "./homework-audience";

export interface HomeworkActor {
  tenantId: string;
  orgId: string;
  userId: string;
}

export async function validateAssignmentInput(
  tx: Prisma.TransactionClient,
  input: CreateHomeworkDto,
  actor: HomeworkActor,
): Promise<Date> {
  const dueAt = new Date(input.dueAt);
  const [academicYear, yearBand, subject, site] = await Promise.all([
    tx.academicYear.findFirst({
      where: {
        id: input.academicYearId,
        tenantId: actor.tenantId,
        status: "ACTIVE",
      },
      select: { startsOn: true, endsOn: true },
    }),
    tx.aceYearBand.findFirst({
      where: {
        id: input.yearBandId,
        tenantId: actor.tenantId,
        isActive: true,
      },
      select: { id: true },
    }),
    tx.subject.findFirst({
      where: {
        id: input.subjectId,
        tenantId: actor.tenantId,
        isActive: true,
      },
      select: { id: true },
    }),
    tx.tenant.findFirst({
      where: { id: actor.tenantId, orgId: actor.orgId },
      select: { timezone: true },
    }),
  ]);
  if (!academicYear || !yearBand || !subject || !site) {
    throw new BadRequestException("Select an active year, class and subject");
  }
  const dueDate = siteCalendarDate(dueAt, site.timezone);
  if (
    dueAt <= new Date() ||
    dueDate < academicYear.startsOn ||
    dueDate > academicYear.endsOn
  ) {
    throw new BadRequestException(
      "Due date must be in the academic year and in the future",
    );
  }
  return dueAt;
}

export function assertHomeworkActor(actor: HomeworkActor): void {
  if (!actor.tenantId || !actor.orgId || !actor.userId) {
    throw new BadRequestException("A complete active-site actor is required");
  }
}

export async function requireStaffAccess(
  tx: Prisma.TransactionClient,
  actor: HomeworkActor,
  yearBandId?: string,
  now = new Date(),
): Promise<{ leader: boolean; today: Date }> {
  const [site, user, membership, vertical] = await Promise.all([
    tx.tenant.findFirst({
      where: { id: actor.tenantId, orgId: actor.orgId },
      select: { id: true, timezone: true },
    }),
    tx.user.findFirst({
      where: { id: actor.userId, isActive: true },
      select: { id: true },
    }),
    tx.siteMembership.findUnique({
      where: {
        tenantId_userId: {
          tenantId: actor.tenantId,
          userId: actor.userId,
        },
      },
      select: { role: true },
    }),
    tx.orgVertical.findFirst({
      where: {
        orgId: actor.orgId,
        vertical: { in: ["ACE_SCHOOL", "ACE_LEARNING_CENTRE"] },
      },
      select: { orgId: true },
    }),
  ]);
  if (!site || !vertical) throw new NotFoundException("ACE site not found");
  if (!user || !membership) throw new ForbiddenException("Permission denied");
  const today = siteCalendarDate(now, site.timezone);
  if (membership.role === "SITE_ADMIN") return { leader: true, today };
  if (!yearBandId) return { leader: false, today };
  const assigned = await tx.aceStaffYearBandAssignment.findFirst({
    where: {
      tenantId: actor.tenantId,
      userId: actor.userId,
      yearBandId,
      startsOn: { lte: today },
      OR: [{ endsOn: null }, { endsOn: { gte: today } }],
    },
    select: { id: true },
  });
  if (!assigned) throw new ForbiddenException("Class assignment required");
  return { leader: false, today };
}
