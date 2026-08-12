import {
  Injectable,
  BadRequestException,
  Inject,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import { prisma } from "@pathway/db";
import { PathwayRequestContext } from "@pathway/auth";
import { Av30ActivityType } from "@pathway/types/av30";
import { Av30ActivityService } from "../av30/av30-activity.service";
import { CreateAttendanceDto } from "./dto/create-attendance.dto";
import { UpdateAttendanceDto } from "./dto/update-attendance.dto";
import type { UpsertSessionAttendanceDto } from "./dto/upsert-session-attendance.dto";
import {
  attendanceStatusFromPresent,
  presentFromAttendanceStatus,
  type AttendanceStatus,
} from "./dto/attendance-status";

const SELECT = {
  id: true,
  childId: true,
  groupId: true,
  present: true,
  status: true,
  timestamp: true,
  sessionId: true,
  correctedAt: true,
  correctedByUserId: true,
  correctionReason: true,
} as const;

type AttendanceStatusInput = {
  status?: AttendanceStatus;
  present?: boolean;
};

function requestedAttendanceStatus(
  input: AttendanceStatusInput,
): AttendanceStatus | undefined {
  if (input.status !== undefined) return input.status;
  if (input.present !== undefined) {
    return attendanceStatusFromPresent(input.present);
  }
  return undefined;
}

function effectiveAttendanceStatus(row: {
  status: AttendanceStatus | null;
  present: boolean;
}): AttendanceStatus {
  return row.status ?? attendanceStatusFromPresent(row.present);
}

function toAttendanceResponse<
  T extends { status: AttendanceStatus | null; present: boolean },
>(row: T): Omit<T, "status"> & { status: AttendanceStatus } {
  return { ...row, status: effectiveAttendanceStatus(row) };
}

@Injectable()
export class AttendanceService {
  constructor(
    @Optional()
    @Inject(Av30ActivityService)
    private readonly av30ActivityService: Av30ActivityService | undefined,
    @Inject(PathwayRequestContext)
    private readonly requestContext: PathwayRequestContext,
  ) {}

  async list(tenantId: string, sessionId?: string) {
    const where: { child: { tenantId: string }; sessionId?: string } = {
      child: { tenantId },
    };
    if (sessionId) where.sessionId = sessionId;
    const rows = await prisma.attendance.findMany({
      where,
      select: SELECT,
      orderBy: [{ timestamp: "desc" }],
    });
    return rows.map(toAttendanceResponse);
  }

  /** Session summaries for list page: sessions in range with markedCount and totalChildCount. */
  async getSessionSummaries(
    tenantId: string,
    from: Date,
    to: Date,
  ): Promise<
    Array<{
      sessionId: string;
      title: string | null;
      startsAt: Date;
      endsAt: Date;
      groupIds: string[];
      ageGroupLabel: string | null;
      markedCount: number;
      totalChildCount: number;
      status: "not_started" | "in_progress" | "complete";
    }>
  > {
    const sessions = await prisma.session.findMany({
      where: {
        tenantId,
        startsAt: { lte: to },
        endsAt: { gte: from },
      },
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        groups: { select: { id: true, name: true } },
      },
      orderBy: { startsAt: "asc" },
    });

    const sessionIds = sessions.map((s) => s.id);
    const [attendanceCounts, childCounts] = await Promise.all([
      prisma.attendance.groupBy({
        by: ["sessionId"],
        where: { sessionId: { in: sessionIds } },
        _count: { id: true },
      }),
      Promise.all(
        sessions.map(async (s) => {
          const groupIds = s.groups.map((g) => g.id);
          if (groupIds.length === 0) return 0;
          return prisma.child.count({
            where: { tenantId, groupId: { in: groupIds } },
          });
        }),
      ),
    ]);
    const markedBySession = new Map(
      attendanceCounts.map((c) => [c.sessionId, c._count.id]),
    );

    return sessions.map((s, i) => {
      const markedCount = markedBySession.get(s.id) ?? 0;
      const totalChildCount = childCounts[i] ?? 0;
      let status: "not_started" | "in_progress" | "complete" = "not_started";
      if (totalChildCount > 0) {
        if (markedCount >= totalChildCount) status = "complete";
        else if (markedCount > 0) status = "in_progress";
      }
      return {
        sessionId: s.id,
        title: s.title,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        groupIds: s.groups.map((g) => g.id),
        ageGroupLabel: s.groups[0]?.name ?? null,
        markedCount,
        totalChildCount,
        status,
      };
    });
  }

  /** Full detail for one session: session, children in session groups, attendance rows. */
  async getSessionAttendanceDetail(sessionId: string, tenantId: string) {
    const session = await prisma.session.findFirst({
      where: { id: sessionId, tenantId },
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        groups: { select: { id: true, name: true } },
      },
    });
    if (!session) throw new NotFoundException("Session not found");

    const groupIds = session.groups.map((g) => g.id);
    const [children, rows] = await Promise.all([
      groupIds.length > 0
        ? prisma.child.findMany({
            where: { tenantId, groupId: { in: groupIds } },
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
            orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          })
        : [],
      prisma.attendance.findMany({
        where: { sessionId, child: { tenantId } },
        select: SELECT,
      }),
    ]);

    const rowsByChild = new Map(rows.map((r) => [r.childId, r]));
    return {
      session: {
        id: session.id,
        title: session.title,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        groupIds: session.groups.map((g) => g.id),
        ageGroupLabel: session.groups[0]?.name ?? null,
      },
      children: children.map((c) => ({
        id: c.id,
        displayName: [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || "Child",
      })),
      rows: children.map((c) => {
        const row = rowsByChild.get(c.id);
        return {
          id: row?.id,
          childId: c.id,
          present: row?.present ?? null,
          status: row ? effectiveAttendanceStatus(row) : null,
          timestamp: row?.timestamp,
          correctedAt: row?.correctedAt,
          correctedByUserId: row?.correctedByUserId,
          correctionReason: row?.correctionReason,
        };
      }),
    };
  }

  /** Idempotent upsert attendance for a session. */
  async upsertSessionAttendance(
    sessionId: string,
    tenantId: string,
    input: UpsertSessionAttendanceDto,
  ) {
    const session = await prisma.session.findFirst({
      where: { id: sessionId, tenantId },
      select: { id: true, groups: { select: { id: true } } },
    });
    if (!session) throw new NotFoundException("Session not found");
    const groupIds = new Set(session.groups.map((g) => g.id));

    const existing = await prisma.attendance.findMany({
      where: { sessionId, child: { tenantId } },
      select: {
        id: true,
        childId: true,
        present: true,
        status: true,
      },
    });
    const existingByChild = new Map(existing.map((row) => [row.childId, row]));

    const now = new Date();
    for (const row of input.rows) {
      const child = await prisma.child.findUnique({
        where: { id: row.childId },
        select: { id: true, tenantId: true, groupId: true },
      });
      if (!child || child.tenantId !== tenantId)
        throw new BadRequestException(`Child ${row.childId} not found`);
      if (!child.groupId || !groupIds.has(child.groupId))
        throw new BadRequestException(
          `Child ${row.childId} is not in a group for this session`,
        );

      const requestedStatus = requestedAttendanceStatus(row);
      if (!requestedStatus) {
        throw new BadRequestException(
          `Attendance status is required for child ${row.childId}`,
        );
      }
      const existingRow = existingByChild.get(row.childId);
      if (existingRow) {
        const correction = this.correctionData(
          tenantId,
          effectiveAttendanceStatus(existingRow),
          requestedStatus,
          row.correctionReason,
          now,
        );
        await prisma.attendance.update({
          where: { id: existingRow.id },
          data: {
            status: requestedStatus,
            present: presentFromAttendanceStatus(requestedStatus),
            timestamp: now,
            ...correction,
          },
          select: SELECT,
        });
      } else {
        await prisma.attendance.create({
          data: {
            childId: row.childId,
            groupId: child.groupId,
            sessionId,
            status: requestedStatus,
            present: presentFromAttendanceStatus(requestedStatus),
            timestamp: now,
          },
          select: SELECT,
        });
      }
    }

    if (this.av30ActivityService) {
      await this.av30ActivityService
        .recordActivityForCurrentUser(
          this.requestContext,
          Av30ActivityType.ATTENDANCE_RECORDED,
          now,
        )
        .catch((err) => {
          console.error("Failed to record AV30 activity for attendance", err);
        });
    }

    return this.getSessionAttendanceDetail(sessionId, tenantId);
  }

  async getById(id: string, tenantId: string) {
    const row = await prisma.attendance.findFirst({
      where: { id, child: { tenantId } },
      select: SELECT,
    });
    if (!row) throw new NotFoundException("Attendance not found");
    return toAttendanceResponse(row);
  }

  async create(input: CreateAttendanceDto, tenantId: string) {
    const status = requestedAttendanceStatus(input);
    if (!status) {
      throw new BadRequestException("status or present is required");
    }
    // Validate child exists
    const child = await prisma.child.findUnique({
      where: { id: input.childId },
      select: { id: true, tenantId: true },
    });
    if (!child || child.tenantId !== tenantId)
      throw new NotFoundException("Attendance not found");

    // Validate group exists
    const group = await prisma.group.findUnique({
      where: { id: input.groupId },
      select: { id: true, tenantId: true },
    });
    if (!group || group.tenantId !== tenantId)
      throw new NotFoundException("Attendance not found");

    // Optional: validate session exists and is consistent
    if (input.sessionId) {
      const session = await prisma.session.findUnique({
        where: { id: input.sessionId },
        select: { id: true, tenantId: true, groups: { select: { id: true } } },
      });
      if (!session || session.tenantId !== tenantId) {
        throw new NotFoundException("Attendance not found");
      }
      if (
        session.groups.length > 0 &&
        input.groupId &&
        !session.groups.some((g) => g.id === input.groupId)
      ) {
        throw new BadRequestException("session is for a different group");
      }
    }

    // Cross-tenant guard
    if (child.tenantId !== group.tenantId)
      throw new BadRequestException(
        "child and group must belong to same tenant",
      );

    const created = await prisma.attendance.create({
      data: {
        child: { connect: { id: input.childId } },
        group: { connect: { id: input.groupId } },
        status,
        present: presentFromAttendanceStatus(status),
        timestamp: input.timestamp ?? new Date(),
        ...(input.sessionId
          ? { session: { connect: { id: input.sessionId } } }
          : {}),
      },
      select: SELECT,
    });

    // Record AV30 activity: staff user recorded attendance
    if (this.av30ActivityService) {
      await this.av30ActivityService
        .recordActivityForCurrentUser(
          this.requestContext,
          Av30ActivityType.ATTENDANCE_RECORDED,
          input.timestamp ?? new Date(),
        )
        .catch((err) => {
          // Log but don't fail the attendance creation if AV30 recording fails
          console.error("Failed to record AV30 activity for attendance", err);
        });
    }

    return toAttendanceResponse(created);
  }

  async update(id: string, input: UpdateAttendanceDto, tenantId: string) {
    // Ensure row exists (also used to infer tenant via relations if needed)
    const current = await prisma.attendance.findFirst({
      where: { id, child: { tenantId } },
      select: {
        id: true,
        groupId: true,
        present: true,
        status: true,
        child: { select: { tenantId: true } },
      },
    });
    if (!current) throw new NotFoundException("Attendance not found");

    // If groupId is changing, ensure cross-tenant safety with the child's tenant
    if (input.groupId) {
      const group = await prisma.group.findUnique({
        where: { id: input.groupId },
        select: { id: true, tenantId: true },
      });
      if (!group || group.tenantId !== tenantId) {
        throw new NotFoundException("Attendance not found");
      }
      if (group.tenantId !== current.child.tenantId) {
        throw new BadRequestException(
          "group does not belong to the child's tenant",
        );
      }
    }

    // Optional: validate session exists and is consistent
    if (input.sessionId) {
      const session = await prisma.session.findUnique({
        where: { id: input.sessionId },
        select: { id: true, tenantId: true, groups: { select: { id: true } } },
      });
      if (!session || session.tenantId !== tenantId) {
        throw new NotFoundException("Attendance not found");
      }
      const effectiveGroupId = input.groupId ?? current.groupId ?? undefined;
      if (
        session.groups.length > 0 &&
        effectiveGroupId &&
        !session.groups.some((g) => g.id === effectiveGroupId)
      ) {
        throw new BadRequestException("session is for a different group");
      }
    }

    const requestedStatus = requestedAttendanceStatus(input);
    const correction = requestedStatus
      ? this.correctionData(
          tenantId,
          effectiveAttendanceStatus(current),
          requestedStatus,
          input.correctionReason,
          new Date(),
        )
      : {};
    const updated = await prisma.attendance.update({
      where: { id },
      data: {
        status: requestedStatus,
        present:
          requestedStatus === undefined
            ? undefined
            : presentFromAttendanceStatus(requestedStatus),
        timestamp: input.timestamp ?? undefined,
        ...correction,
        groupId: input.groupId ?? undefined,
        sessionId: input.sessionId ?? undefined,
      },
      select: SELECT,
    });

    // Record AV30 activity: staff user updated attendance
    if (this.av30ActivityService) {
      await this.av30ActivityService
        .recordActivityForCurrentUser(
          this.requestContext,
          Av30ActivityType.ATTENDANCE_RECORDED,
          input.timestamp ?? updated.timestamp,
        )
        .catch((err) => {
          // Log but don't fail the attendance update if AV30 recording fails
          console.error(
            "Failed to record AV30 activity for attendance update",
            err,
          );
        });
    }

    return toAttendanceResponse(updated);
  }

  private correctionData(
    tenantId: string,
    currentStatus: AttendanceStatus,
    requestedStatus: AttendanceStatus,
    correctionReason: string | undefined,
    correctedAt: Date,
  ):
    | {
        correctedAt: Date;
        correctedByUserId: string;
        correctionReason: string;
      }
    | Record<string, never> {
    if (currentStatus === requestedStatus) return {};

    const normalizedReason = correctionReason?.trim();
    if (!normalizedReason) {
      throw new BadRequestException(
        "correctionReason is required when changing attendance status",
      );
    }

    const actorUserId = this.requestContext.currentUserId;
    if (!actorUserId || this.requestContext.currentTenantId !== tenantId) {
      throw new UnauthorizedException(
        "An authenticated site actor is required to correct attendance",
      );
    }

    return {
      correctedAt,
      correctedByUserId: actorUserId,
      correctionReason: normalizedReason,
    };
  }
}
