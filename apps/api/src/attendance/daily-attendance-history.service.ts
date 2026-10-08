import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  withTenantRlsContext,
  type AceDailyAbsenceReason,
  type AttendanceStatus,
} from "@pathway/db";
import {
  attendanceHistoryCursorScope,
  decodeAttendanceHistoryCursor,
  encodeAttendanceHistoryCursor,
  requireAttendanceHistoryCursorSigningKey,
} from "./attendance-history-cursor";
import {
  resolveDailyAttendanceAccess,
  type DailyAttendanceActor,
} from "./daily-attendance-access";
import type { AttendanceHistoryQuery } from "./dto/attendance-history-query.dto";

const DEFAULT_LIMIT = 25;

export interface DailyAttendanceHistoryPage {
  items: Array<{
    previousStatus: AttendanceStatus;
    newStatus: AttendanceStatus;
    previousReason: AceDailyAbsenceReason | null;
    newReason: AceDailyAbsenceReason | null;
    correctionReason: string;
    correctedAt: string;
    correctedBy: string;
  }>;
  nextCursor: string | null;
}

@Injectable()
export class DailyAttendanceHistoryService {
  async list(
    factId: string,
    query: AttendanceHistoryQuery,
    actor: DailyAttendanceActor,
  ): Promise<DailyAttendanceHistoryPage> {
    if (!actor.tenantId || !actor.orgId || !actor.userId) {
      throw new BadRequestException("An active site is required");
    }
    requireAttendanceHistoryCursorSigningKey();
    const limit = query.limit ?? DEFAULT_LIMIT;
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const fact = await tx.aceDailyAttendance.findFirst({
        where: { id: factId, tenantId: actor.tenantId },
        select: { childId: true, date: true },
      });
      if (!fact) throw new NotFoundException("Daily attendance not found");

      let bands: Array<{ id: string; name: string }>;
      try {
        ({ bands } = await resolveDailyAttendanceAccess(
          tx,
          actor,
          fact.date,
          "attendance.read",
        ));
      } catch (error) {
        if (error instanceof ForbiddenException) {
          throw new NotFoundException("Daily attendance not found");
        }
        throw error;
      }
      const enrollment = await tx.aceSchoolEnrollment.findFirst({
        where: {
          tenantId: actor.tenantId,
          childId: fact.childId,
          yearBandId: { in: bands.map((band) => band.id) },
          startsOn: { lte: fact.date },
          OR: [{ endsOn: null }, { endsOn: { gte: fact.date } }],
          academicYear: {
            startsOn: { lte: fact.date },
            endsOn: { gte: fact.date },
          },
          child: { tenantId: actor.tenantId, isGuest: false },
        },
        select: { id: true },
      });
      if (!enrollment) {
        throw new NotFoundException("Daily attendance not found");
      }

      const scope = attendanceHistoryCursorScope(
        actor.tenantId,
        actor.orgId,
        `daily:${factId}`,
      );
      let cursor: ReturnType<typeof decodeAttendanceHistoryCursor> | undefined;
      if (query.cursor) {
        try {
          cursor = decodeAttendanceHistoryCursor(query.cursor, scope);
        } catch {
          throw new BadRequestException(
            "Invalid daily attendance history cursor",
          );
        }
      }

      const rows = await tx.aceDailyAttendanceCorrectionEvent.findMany({
        where: {
          tenantId: actor.tenantId,
          dailyAttendanceId: factId,
          ...(cursor
            ? {
                OR: [
                  { correctedAt: { lt: cursor.correctedAt } },
                  { correctedAt: cursor.correctedAt, id: { lt: cursor.id } },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          previousStatus: true,
          newStatus: true,
          previousReason: true,
          newReason: true,
          correctionReason: true,
          correctedAt: true,
          correctedBy: { select: { displayName: true, name: true } },
        },
        orderBy: [{ correctedAt: "desc" }, { id: "desc" }],
        take: limit + 1,
      });
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        items: page.map((row) => ({
          previousStatus: row.previousStatus,
          newStatus: row.newStatus,
          previousReason: row.previousReason,
          newReason: row.newReason,
          correctionReason: row.correctionReason,
          correctedAt: row.correctedAt.toISOString(),
          correctedBy:
            row.correctedBy.displayName?.trim() ||
            row.correctedBy.name?.trim() ||
            "Staff member",
        })),
        nextCursor:
          rows.length > limit && last
            ? encodeAttendanceHistoryCursor(
                { correctedAt: last.correctedAt, id: last.id },
                scope,
              )
            : null,
      };
    });
  }
}
