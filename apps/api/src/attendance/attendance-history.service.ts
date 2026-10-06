import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { withTenantRlsContext, type AttendanceStatus } from "@pathway/db";
import type { AttendanceHistoryQuery } from "./dto/attendance-history-query.dto";
import {
  attendanceHistoryCursorScope,
  decodeAttendanceHistoryCursor,
  encodeAttendanceHistoryCursor,
  requireAttendanceHistoryCursorSigningKey,
} from "./attendance-history-cursor";

const DEFAULT_LIMIT = 25;

export interface AttendanceHistoryPage {
  items: Array<{
    previousStatus: AttendanceStatus | null;
    newStatus: AttendanceStatus;
    reason: string;
    correctedAt: string;
    correctedBy: string;
    recoveredLegacy: boolean;
  }>;
  nextCursor: string | null;
}

@Injectable()
export class AttendanceHistoryService {
  async list(
    attendanceId: string,
    tenantId: string,
    orgId: string,
    query: AttendanceHistoryQuery,
  ): Promise<AttendanceHistoryPage> {
    if (!tenantId?.trim() || !orgId?.trim()) {
      throw new BadRequestException("An active site is required");
    }
    requireAttendanceHistoryCursorSigningKey();
    const scope = attendanceHistoryCursorScope(tenantId, orgId, attendanceId);
    const limit = query.limit ?? DEFAULT_LIMIT;
    return withTenantRlsContext(tenantId, orgId, async (tx) => {
      const [site, attendance] = await Promise.all([
        tx.tenant.findFirst({
          where: { id: tenantId, orgId },
          select: { id: true },
        }),
        tx.attendance.findFirst({
          where: { id: attendanceId, child: { tenantId } },
          select: { id: true },
        }),
      ]);
      if (!site || !attendance) {
        throw new NotFoundException("Attendance not found");
      }

      let cursor: ReturnType<typeof decodeAttendanceHistoryCursor> | undefined;
      if (query.cursor) {
        try {
          cursor = decodeAttendanceHistoryCursor(query.cursor, scope);
        } catch {
          throw new BadRequestException("Invalid attendance history cursor");
        }
      }

      const rows = await tx.attendanceCorrectionEvent.findMany({
        where: {
          tenantId,
          attendanceId,
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
          reason: true,
          correctedAt: true,
          origin: true,
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
          reason: row.reason,
          correctedAt: row.correctedAt.toISOString(),
          correctedBy:
            row.correctedBy.displayName?.trim() ||
            row.correctedBy.name?.trim() ||
            "Staff member",
          recoveredLegacy: row.origin === "LEGACY_BACKFILL",
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
