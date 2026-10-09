import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@pathway/db";
import type { SaveStudentTimetableDraftDto } from "./dto/ace-subject-timetable.dto";

export interface TimetableActor {
  tenantId: string;
  orgId: string;
  userId: string;
}

function scheduleLockKey(
  tenantId: string,
  periodId: string,
  bandId: string,
): string {
  return `ace-timetable-schedule:${tenantId}:${periodId}:${bandId}`;
}

export async function acquireTimetableScheduleWriteLock(
  tx: Prisma.TransactionClient,
  tenantId: string,
  periodId: string,
  bandId: string,
): Promise<void> {
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(
      hashtextextended(${scheduleLockKey(tenantId, periodId, bandId)}, 0)
    )`,
  );
}

export async function acquireTimetableScheduleReadLock(
  tx: Prisma.TransactionClient,
  tenantId: string,
  periodId: string,
  bandId: string,
): Promise<void> {
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock_shared(
      hashtextextended(${scheduleLockKey(tenantId, periodId, bandId)}, 0)
    )`,
  );
}

export async function acquireTimetableDraftLock(
  tx: Prisma.TransactionClient,
  tenantId: string,
  periodId: string,
  childId: string,
): Promise<void> {
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(
      hashtextextended(${`ace-timetable-draft:${tenantId}:${periodId}:${childId}`}, 0)
    )`,
  );
}

export async function requireTimetableSite(
  tx: Prisma.TransactionClient,
  actor: TimetableActor,
): Promise<void> {
  if (!actor.tenantId || !actor.orgId || !actor.userId) {
    throw new BadRequestException("An active-site actor is required");
  }
  const site = await tx.tenant.findFirst({
    where: { id: actor.tenantId, orgId: actor.orgId },
    select: { id: true },
  });
  if (!site) throw new NotFoundException("Active site not found");
}

export async function requireTimetablePeriod(
  tx: Prisma.TransactionClient,
  tenantId: string,
  periodId: string,
) {
  const period = await tx.academicPeriod.findFirst({
    where: { id: periodId, tenantId },
    select: {
      id: true,
      name: true,
      academicYearId: true,
      startsOn: true,
      endsOn: true,
      academicYear: { select: { startsOn: true, endsOn: true } },
    },
  });
  if (!period) throw new NotFoundException("Academic period not found");
  if (
    period.startsOn < period.academicYear.startsOn ||
    period.endsOn > period.academicYear.endsOn
  ) {
    throw new ConflictException("The academic period is outside its year");
  }
  return period;
}

export async function requireTimetableBand(
  tx: Prisma.TransactionClient,
  tenantId: string,
  bandId: string,
) {
  const band = await tx.aceYearBand.findFirst({
    where: { id: bandId, tenantId, isActive: true },
    select: { id: true, name: true },
  });
  if (!band) throw new NotFoundException("Year band not found");
  return band;
}

export async function requireEligibleTimetableChild(
  tx: Prisma.TransactionClient,
  tenantId: string,
  childId: string,
  period: Awaited<ReturnType<typeof requireTimetablePeriod>>,
  yearBandId: string,
) {
  const child = await tx.child.findFirst({
    where: { id: childId, tenantId, isGuest: false },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!child) throw new NotFoundException("Student not found");
  const enrollments = await tx.aceSchoolEnrollment.findMany({
    where: {
      tenantId,
      childId,
      academicYearId: period.academicYearId,
      startsOn: { lte: period.endsOn },
      OR: [{ endsOn: null }, { endsOn: { gte: period.startsOn } }],
    },
    select: { yearBandId: true },
    take: 2,
  });
  if (enrollments.length !== 1 || enrollments[0].yearBandId !== yearBandId) {
    throw new ConflictException(
      "The student's school enrolment does not match this period and year band",
    );
  }
  return child;
}

export async function requireValidTimetableEntries(
  tx: Prisma.TransactionClient,
  tenantId: string,
  childId: string,
  period: Awaited<ReturnType<typeof requireTimetablePeriod>>,
  schedule: {
    teachingDays: readonly string[];
    slots: ReadonlyArray<{ id: string; kind: "LESSON" | "BREAK" }>;
  },
  entries: SaveStudentTimetableDraftDto["entries"],
) {
  const days = new Set(schedule.teachingDays);
  const lessonSlots = new Set(
    schedule.slots
      .filter((slot) => slot.kind === "LESSON")
      .map((slot) => slot.id),
  );
  if (
    entries.some(
      (entry) => !days.has(entry.day) || !lessonSlots.has(entry.slotId),
    )
  ) {
    throw new BadRequestException(
      "An entry is outside the teaching lesson grid",
    );
  }
  const ids = [...new Set(entries.map((entry) => entry.subjectId))];
  if (!ids.length)
    return new Map<string, { name: string; color: string | null }>();
  const subjects = await tx.subject.findMany({
    where: { tenantId, id: { in: ids }, isActive: true },
    select: { id: true, name: true, color: true },
  });
  if (subjects.length !== ids.length) {
    throw new BadRequestException(
      "Each chosen subject must be active at this site",
    );
  }
  const enrollments = await tx.studentSubjectEnrollment.findMany({
    where: {
      tenantId,
      childId,
      subjectId: { in: ids },
      status: "ACTIVE",
      startsOn: { lte: period.endsOn },
      OR: [{ endsOn: null }, { endsOn: { gte: period.startsOn } }],
    },
    select: { subjectId: true },
  });
  const enrolled = new Set(enrollments.map((row) => row.subjectId));
  if (ids.some((id) => !enrolled.has(id))) {
    throw new BadRequestException(
      "Each chosen subject needs an active enrolment for this student and period",
    );
  }
  return new Map(subjects.map(({ id, name, color }) => [id, { name, color }]));
}
