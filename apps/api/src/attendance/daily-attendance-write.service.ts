import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  Prisma,
  withTenantRlsContext,
  type AceDailyAbsenceReason,
  type AttendanceStatus,
} from "@pathway/db";
import { isDateOnly } from "../ace-settings/dto/academic-calendar.dto";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import { LoggingService } from "../common/logging/logging.service";
import {
  resolveDailyAttendanceAccess,
  type DailyAttendanceActor,
} from "./daily-attendance-access";
import type { DailyAttendanceMark } from "./dto/daily-attendance-mark.dto";

export interface DailyAttendanceSavedMark {
  id: string;
  childId: string;
  date: string;
  status: AttendanceStatus;
  absenceReason: AceDailyAbsenceReason | null;
  recordedAt: string;
  updatedAt: string;
}

@Injectable()
export class DailyAttendanceWriteService {
  constructor(
    @Inject(LoggingService) private readonly logging: LoggingService,
  ) {}

  async save(
    dateString: string,
    childId: string,
    command: DailyAttendanceMark,
    actor: DailyAttendanceActor,
  ): Promise<DailyAttendanceSavedMark> {
    if (!isDateOnly(dateString) || !childId.trim()) {
      throw new BadRequestException("A valid date and child ID are required");
    }
    if (!actor.tenantId || !actor.orgId || !actor.userId) {
      throw new BadRequestException("An active site is required");
    }
    const date = new Date(`${dateString}T00:00:00.000Z`);
    const absenceReason =
      command.status === "ABSENT" ? (command.absenceReason ?? null) : null;

    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      // Also serialize initial marks, where there is no fact row to lock yet.
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`ace-daily:${actor.tenantId}:${childId}:${dateString}`}, 0))`,
      );

      const { timezone, bands } = await resolveDailyAttendanceAccess(
        tx,
        actor,
        date,
        "attendance.manage",
      );
      const enrollment = await tx.aceSchoolEnrollment.findFirst({
        where: {
          tenantId: actor.tenantId,
          childId,
          yearBandId: { in: bands.map((band) => band.id) },
          startsOn: { lte: date },
          OR: [{ endsOn: null }, { endsOn: { gte: date } }],
          academicYear: { startsOn: { lte: date }, endsOn: { gte: date } },
          child: { tenantId: actor.tenantId, isGuest: false },
        },
        select: { academicYearId: true },
      });
      if (!enrollment) {
        this.logging
          .createLogger(DailyAttendanceWriteService.name)
          .warn("daily-attendance-scope-denied", {
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            userId: actor.userId,
            childId,
            date: dateString,
          });
        throw new NotFoundException("Child not found");
      }
      if (!timezone?.trim() || !isValidTimezone(timezone)) {
        throw new ConflictException("Site timezone is not configured");
      }
      const teachingDate = await tx.aceTeachingDate.findUnique({
        where: { tenantId_date: { tenantId: actor.tenantId, date } },
        select: { academicYearId: true, kind: true },
      });
      if (
        !teachingDate ||
        teachingDate.academicYearId !== enrollment.academicYearId ||
        !["TEACHING", "EXCEPTIONAL_OPEN"].includes(teachingDate.kind)
      ) {
        throw new ConflictException("This date is not open for teaching");
      }

      const existing = await tx.aceDailyAttendance.findUnique({
        where: {
          tenantId_childId_date: { tenantId: actor.tenantId, childId, date },
        },
      });
      if (
        existing?.status === command.status &&
        existing.absenceReason === absenceReason
      ) {
        return toSavedMark(existing, dateString);
      }
      const correctionReason = command.correctionReason;
      if (existing && !correctionReason) {
        throw new BadRequestException("A correction reason is required");
      }

      const mark = existing
        ? await tx.aceDailyAttendance.update({
            where: { id: existing.id },
            data: { status: command.status, absenceReason },
          })
        : await tx.aceDailyAttendance.create({
            data: {
              tenantId: actor.tenantId,
              childId,
              date,
              status: command.status,
              absenceReason,
              recordedByUserId: actor.userId,
            },
          });

      const correction =
        existing && correctionReason
          ? await tx.aceDailyAttendanceCorrectionEvent.create({
              data: {
                tenantId: actor.tenantId,
                dailyAttendanceId: mark.id,
                previousStatus: existing.status,
                newStatus: mark.status,
                previousReason: existing.absenceReason,
                newReason: mark.absenceReason,
                correctionReason,
                correctedByUserId: actor.userId,
              },
              select: { id: true },
            })
          : null;
      await recordAuditEventInTransaction(tx, {
        actorUserId: actor.userId,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        entityType: AuditEntityType.ACE_RECORD,
        entityId: mark.id,
        action: existing ? AuditAction.UPDATED : AuditAction.CREATED,
        metadata: {
          recordType: "ACE_DAILY_ATTENDANCE",
          childId,
          date: dateString,
          ...(correction ? { correctionEventId: correction.id } : {}),
        },
      });
      return toSavedMark(mark, dateString);
    });
  }
}

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function toSavedMark(
  mark: {
    id: string;
    childId: string;
    status: AttendanceStatus;
    absenceReason: AceDailyAbsenceReason | null;
    recordedAt: Date;
    updatedAt: Date;
  },
  date: string,
): DailyAttendanceSavedMark {
  return {
    id: mark.id,
    childId: mark.childId,
    date,
    status: mark.status,
    absenceReason: mark.absenceReason,
    recordedAt: mark.recordedAt.toISOString(),
    updatedAt: mark.updatedAt.toISOString(),
  };
}
