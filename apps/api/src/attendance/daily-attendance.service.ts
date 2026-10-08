import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  withTenantRlsContext,
  type AceDailyAbsenceReason,
  type AttendanceStatus,
  type Prisma,
} from "@pathway/db";
import type { DailyAttendanceQuery } from "./dto/daily-attendance-query.dto";
import {
  resolveDailyAttendanceAccess,
  type DailyAttendanceActor,
} from "./daily-attendance-access";

export interface DailyAttendancePage {
  date: string;
  timezone: string | null;
  teachingDate: { kind: string; reason: string | null } | null;
  permittedBands: Array<{ id: string; name: string }>;
  page: number;
  limit: number;
  total: number;
  nextPage: number | null;
  counts: { present: number; absent: number; late: number; unmarked: number };
  items: Array<{
    childId: string;
    displayName: string;
    academicYear: string;
    band: { id: string; name: string };
    mark: {
      id: string;
      status: AttendanceStatus;
      absenceReason: AceDailyAbsenceReason | null;
      recordedAt: string;
      recordedBy: string;
    } | null;
  }>;
}

@Injectable()
export class DailyAttendanceService {
  async list(
    query: DailyAttendanceQuery,
    actor: DailyAttendanceActor,
  ): Promise<DailyAttendancePage> {
    if (!actor.tenantId || !actor.orgId || !actor.userId) {
      throw new BadRequestException("An active site is required");
    }
    const date = new Date(`${query.date}T00:00:00.000Z`);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const { timezone, bands } = await resolveDailyAttendanceAccess(
        tx,
        actor,
        date,
        "attendance.read",
      );
      if (query.bandId && !bands.some((band) => band.id === query.bandId)) {
        throw new NotFoundException("Year band not found");
      }

      const visibleBandIds = query.bandId
        ? [query.bandId]
        : bands.map((band) => band.id);
      const enrollmentWhere = {
        tenantId: actor.tenantId,
        yearBandId: { in: visibleBandIds },
        startsOn: { lte: date },
        OR: [{ endsOn: null }, { endsOn: { gte: date } }],
        academicYear: { startsOn: { lte: date }, endsOn: { gte: date } },
        child: { tenantId: actor.tenantId, isGuest: false },
      } satisfies Prisma.AceSchoolEnrollmentWhereInput;
      const [total, enrollments, statusCounts, teachingDate] =
        await Promise.all([
          tx.aceSchoolEnrollment.count({ where: enrollmentWhere }),
          tx.aceSchoolEnrollment.findMany({
            where: enrollmentWhere,
            orderBy: [
              { child: { lastName: "asc" } },
              { child: { firstName: "asc" } },
              { childId: "asc" },
            ],
            skip: (query.page - 1) * query.limit,
            take: query.limit,
            select: {
              childId: true,
              child: {
                select: {
                  firstName: true,
                  lastName: true,
                  preferredName: true,
                },
              },
              academicYear: { select: { name: true } },
              yearBand: { select: { id: true, name: true } },
            },
          }),
          tx.aceDailyAttendance.groupBy({
            by: ["status"],
            where: {
              tenantId: actor.tenantId,
              date,
              child: { aceSchoolEnrollments: { some: enrollmentWhere } },
            },
            _count: { _all: true },
          }),
          tx.aceTeachingDate.findUnique({
            where: { tenantId_date: { tenantId: actor.tenantId, date } },
            select: { kind: true, reason: true },
          }),
        ]);
      const marks = enrollments.length
        ? await tx.aceDailyAttendance.findMany({
            where: {
              tenantId: actor.tenantId,
              date,
              childId: { in: enrollments.map((row) => row.childId) },
            },
            select: {
              id: true,
              childId: true,
              status: true,
              absenceReason: true,
              recordedAt: true,
              recordedBy: { select: { displayName: true, name: true } },
            },
          })
        : [];
      const marksByChild = new Map(marks.map((mark) => [mark.childId, mark]));
      const counts = { present: 0, absent: 0, late: 0, unmarked: 0 };
      for (const row of statusCounts) {
        if (row.status === "PRESENT") counts.present = row._count._all;
        if (row.status === "ABSENT") counts.absent = row._count._all;
        if (row.status === "LATE") counts.late = row._count._all;
      }
      counts.unmarked = total - counts.present - counts.absent - counts.late;

      return {
        date: query.date,
        timezone,
        teachingDate,
        permittedBands: bands,
        page: query.page,
        limit: query.limit,
        total,
        nextPage: query.page * query.limit < total ? query.page + 1 : null,
        counts,
        items: enrollments.map((enrollment) => {
          const mark = marksByChild.get(enrollment.childId);
          return {
            childId: enrollment.childId,
            displayName:
              `${enrollment.child.preferredName?.trim() || enrollment.child.firstName} ${enrollment.child.lastName}`.trim(),
            academicYear: enrollment.academicYear.name,
            band: enrollment.yearBand,
            mark: mark
              ? {
                  id: mark.id,
                  status: mark.status,
                  absenceReason: mark.absenceReason,
                  recordedAt: mark.recordedAt.toISOString(),
                  recordedBy:
                    mark.recordedBy.displayName?.trim() ||
                    mark.recordedBy.name?.trim() ||
                    "Staff member",
                }
              : null,
          };
        }),
      };
    });
  }
}
