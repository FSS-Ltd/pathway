import {
  BadRequestException,
  ConflictException,
  Injectable,
} from "@nestjs/common";
import { withTenantRlsContext, type Prisma } from "@pathway/db";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import {
  resolveDailyAttendanceExportScope,
  type DailyAttendanceActor,
} from "./daily-attendance-access";
import type { DailyAttendanceExportQuery } from "./dto/daily-attendance-export-query.dto";

const MAX_EXPORT_ROWS = 5_000;
const CSV_HEADERS = [
  "Date",
  "Student ID",
  "Student Name",
  "Year Band",
  "Status",
  "Absence Reason",
  "Recorded At",
] as const;

@Injectable()
export class DailyAttendanceExportService {
  async export(
    query: DailyAttendanceExportQuery,
    actor: DailyAttendanceActor,
  ): Promise<string> {
    if (!actor.tenantId || !actor.orgId || !actor.userId) {
      throw new BadRequestException("An active site is required");
    }
    const from = new Date(`${query.from}T00:00:00.000Z`);
    const to = new Date(`${query.to}T00:00:00.000Z`);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const scope = await resolveDailyAttendanceExportScope(
        tx,
        actor,
        from,
        to,
      );
      const permittedByDate = new Map<string, Set<string>>();
      const dateFilters: Prisma.AceDailyAttendanceWhereInput[] = [];
      for (let day = from.getTime(); day <= to.getTime(); day += 86_400_000) {
        const date = new Date(day);
        const bandIds = new Set(
          scope.assignments
            .filter(
              (assignment) =>
                assignment.startsOn <= date &&
                (!assignment.endsOn || assignment.endsOn >= date),
            )
            .map((assignment) => assignment.yearBandId),
        );
        permittedByDate.set(date.toISOString().slice(0, 10), bandIds);
        if (!scope.leader && bandIds.size === 0) continue;
        dateFilters.push({
          date,
          child: {
            tenantId: actor.tenantId,
            isGuest: false,
            aceSchoolEnrollments: {
              some: {
                tenantId: actor.tenantId,
                startsOn: { lte: date },
                OR: [{ endsOn: null }, { endsOn: { gte: date } }],
                academicYear: {
                  startsOn: { lte: date },
                  endsOn: { gte: date },
                },
                ...(scope.leader ? {} : { yearBandId: { in: [...bandIds] } }),
              },
            },
          },
        });
      }

      const marks = dateFilters.length
        ? await tx.aceDailyAttendance.findMany({
            where: {
              tenantId: actor.tenantId,
              ...(query.childId ? { childId: query.childId } : {}),
              OR: dateFilters,
            },
            select: {
              childId: true,
              date: true,
              status: true,
              absenceReason: true,
              recordedAt: true,
              child: {
                select: {
                  firstName: true,
                  lastName: true,
                  preferredName: true,
                },
              },
            },
            orderBy: [{ date: "asc" }, { childId: "asc" }],
            take: MAX_EXPORT_ROWS + 1,
          })
        : [];
      if (marks.length > MAX_EXPORT_ROWS) {
        throw new BadRequestException(
          `Export exceeds ${MAX_EXPORT_ROWS} records; narrow the date range`,
        );
      }

      const enrollments = marks.length
        ? await tx.aceSchoolEnrollment.findMany({
            where: {
              tenantId: actor.tenantId,
              childId: { in: [...new Set(marks.map((mark) => mark.childId))] },
              startsOn: { lte: to },
              OR: [{ endsOn: null }, { endsOn: { gte: from } }],
              academicYear: { startsOn: { lte: to }, endsOn: { gte: from } },
            },
            select: {
              childId: true,
              yearBandId: true,
              yearBand: { select: { name: true } },
              startsOn: true,
              endsOn: true,
              academicYear: { select: { startsOn: true, endsOn: true } },
            },
            orderBy: { startsOn: "desc" },
          })
        : [];
      const enrollmentsByChild = new Map<string, typeof enrollments>();
      for (const enrollment of enrollments) {
        const childEnrollments =
          enrollmentsByChild.get(enrollment.childId) ?? [];
        childEnrollments.push(enrollment);
        enrollmentsByChild.set(enrollment.childId, childEnrollments);
      }
      const csvRows = marks.map((mark) => {
        const day = mark.date.toISOString().slice(0, 10);
        const matching = (enrollmentsByChild.get(mark.childId) ?? []).find(
          (enrollment) =>
            enrollment.childId === mark.childId &&
            enrollment.startsOn <= mark.date &&
            (!enrollment.endsOn || enrollment.endsOn >= mark.date) &&
            enrollment.academicYear.startsOn <= mark.date &&
            enrollment.academicYear.endsOn >= mark.date &&
            (scope.leader ||
              permittedByDate.get(day)?.has(enrollment.yearBandId)),
        );
        if (!matching) {
          throw new ConflictException("Attendance scope changed; retry export");
        }
        return [
          day,
          mark.childId,
          `${mark.child.preferredName?.trim() || mark.child.firstName} ${mark.child.lastName}`.trim(),
          matching.yearBand.name,
          mark.status,
          mark.status === "ABSENT" ? (mark.absenceReason ?? "") : "",
          mark.recordedAt.toISOString(),
        ];
      });

      await recordAuditEventInTransaction(tx, {
        actorUserId: actor.userId,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        entityType: AuditEntityType.ACE_RECORD,
        action: AuditAction.EXPORTED,
        metadata: {
          recordType: "ACE_DAILY_ATTENDANCE_EXPORT",
          from: query.from,
          to: query.to,
          childId: query.childId ?? null,
          rowCount: csvRows.length,
        },
      });
      return toCsv([CSV_HEADERS, ...csvRows]);
    });
  }
}

function toCsv(rows: readonly (readonly string[])[]): string {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

function csvCell(value: string): string {
  const normalized = value.replace(/[\r\n\t]/g, " ");
  const safe = /^\s*[=+\-@]/.test(normalized) ? `'${normalized}` : normalized;
  return `"${safe.replace(/"/g, '""')}"`;
}
