import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { prisma, Weekday } from "@pathway/db";
import {
  createSessionSchema,
  type CreateSessionDto,
} from "./dto/create-session.dto";
import {
  updateSessionSchema,
  type UpdateSessionDto,
} from "./dto/update-session.dto";
import {
  bulkCreateSessionsSchema,
  type BulkCreateSessionsDto,
} from "./dto/bulk-create-sessions.dto";

const WEEKDAY_ORDER: Weekday[] = [
  Weekday.SUN,
  Weekday.MON,
  Weekday.TUE,
  Weekday.WED,
  Weekday.THU,
  Weekday.FRI,
  Weekday.SAT,
];

export interface SessionListFilters {
  tenantId: string;
  groupId?: string;
  /** overlap window start */
  from?: Date;
  /** overlap window end */
  to?: Date;
}

@Injectable()
export class SessionsService {
  private handlePrismaError(
    e: unknown,
    action: "create" | "update" | "delete",
  ): never {
    const code =
      typeof e === "object" && e !== null && "code" in e
        ? String((e as { code?: unknown }).code)
        : undefined;
    const message =
      typeof e === "object" &&
      e !== null &&
      "message" in e &&
      typeof (e as { message?: unknown }).message === "string"
        ? (e as { message: string }).message
        : "Unknown error";

    if (code === "P2025") {
      throw new NotFoundException("Session not found");
    }
    if (code === "P2002") {
      throw new ConflictException(
        "Duplicate session violates a unique constraint",
      );
    }
    if (code === "P2003") {
      throw new BadRequestException(
        `Invalid reference on ${action}: ${message}`,
      );
    }
    throw new BadRequestException(`Failed to ${action} session: ${message}`);
  }

  async list(filters: SessionListFilters) {
    const where: {
      tenantId: string;
      groups?: { some: { id: string } };
      AND?: Array<Record<string, unknown>>;
    } = { tenantId: filters.tenantId };

    if (filters.groupId) where.groups = { some: { id: filters.groupId } };

    const andClauses: Array<Record<string, unknown>> = [];
    const { from, to } = filters;
    if (from && to) {
      andClauses.push({ startsAt: { lte: to } });
      andClauses.push({ endsAt: { gte: from } });
    } else if (from) {
      andClauses.push({ endsAt: { gte: from } });
    } else if (to) {
      andClauses.push({ startsAt: { lte: to } });
    }
    if (andClauses.length) where.AND = andClauses;

    const sessions = await prisma.session.findMany({
      where,
      orderBy: { startsAt: "asc" },
      include: {
        groups: { select: { id: true, name: true } },
      },
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
            where: { tenantId: filters.tenantId, groupId: { in: groupIds } },
          });
        }),
      ),
    ]);
    const markedBySession = new Map(
      attendanceCounts.map((c) => [c.sessionId, c._count.id]),
    );

    return sessions.map((s, i) => ({
      ...s,
      attendanceMarked: markedBySession.get(s.id) ?? 0,
      attendanceTotal: childCounts[i] ?? 0,
    }));
  }

  async getById(id: string, tenantId: string) {
    const s = await prisma.session.findFirst({
      where: { id, tenantId },
      include: {
        groups: { select: { id: true, name: true } },
        lessons: {
          take: 1,
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            title: true,
            description: true,
            resourceFileName: true,
            fileKey: true,
          },
        },
      },
    });
    if (!s) throw new NotFoundException("Session not found");

    const [attendanceCount, totalChildCount] = await Promise.all([
      prisma.attendance.count({
        where: { sessionId: id },
      }),
      (async () => {
        const groupIds = s.groups.map((g) => g.id);
        if (groupIds.length === 0) return 0;
        return prisma.child.count({
          where: { tenantId, groupId: { in: groupIds } },
        });
      })(),
    ]);

    return {
      ...s,
      attendanceMarked: attendanceCount,
      attendanceTotal: totalChildCount,
    };
  }

  async create(input: CreateSessionDto, tenantId: string) {
    // Normalize & validate (map Zod errors to HTTP 400)
    let parsed: CreateSessionDto;
    try {
      parsed = createSessionSchema.parse(input);
    } catch {
      throw new BadRequestException("invalid body");
    }
    if (parsed.tenantId !== tenantId) {
      throw new BadRequestException("tenantId must match current tenant");
    }
    if (parsed.endsAt.getTime() <= parsed.startsAt.getTime()) {
      throw new BadRequestException("endsAt must be after startsAt");
    }

    // ensure tenant exists for clearer error than FK violation
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) throw new BadRequestException("tenant not found");

    const groupIds = (
      parsed.groupIds?.length
        ? parsed.groupIds
        : parsed.groupId
          ? [parsed.groupId]
          : []
    ) as string[];

    if (groupIds.length) {
      const groups = await prisma.group.findMany({
        where: { id: { in: groupIds }, tenantId },
        select: { id: true },
      });
      const found = new Set(groups.map((g) => g.id));
      const missing = groupIds.filter((id) => !found.has(id));
      if (missing.length) throw new BadRequestException("group not found or wrong tenant");
    }

    try {
      const created = await prisma.session.create({
        data: {
          tenantId,
          groups: groupIds.length
            ? { connect: groupIds.map((id) => ({ id })) }
            : undefined,
          startsAt: parsed.startsAt,
          endsAt: parsed.endsAt,
          title: parsed.title?.trim() ?? null,
        },
        include: { groups: { select: { id: true, name: true } } },
      });
      return created;
    } catch (e) {
      this.handlePrismaError(e, "create");
    }
  }

  /**
   * Bulk-create sessions for a date range and days of week.
   * Does not create sessions in the past.
   */
  async bulkCreate(
    input: BulkCreateSessionsDto,
    tenantId: string,
  ): Promise<{
    created: Awaited<ReturnType<typeof prisma.session.create>>[];
  }> {
    let parsed: BulkCreateSessionsDto;
    try {
      parsed = bulkCreateSessionsSchema.parse(input);
    } catch {
      throw new BadRequestException("invalid body");
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) throw new BadRequestException("tenant not found");

    const groups = await prisma.group.findMany({
      where: { id: { in: parsed.groupIds }, tenantId },
      select: { id: true },
    });
    const foundIds = new Set(groups.map((g) => g.id));
    const missing = parsed.groupIds.filter((id) => !foundIds.has(id));
    if (missing.length) throw new BadRequestException("group not found or wrong tenant");

    const [sh, sm] = parsed.startTime.split(":").map(Number);
    const [eh, em] = parsed.endTime.split(":").map(Number);
    const now = new Date();
    const requestedDays = new Set(parsed.daysOfWeek);

    const dates: { dateStr: string; startsAt: Date; endsAt: Date }[] = [];
    const start = new Date(parsed.startDate + "T00:00:00");
    const end = new Date(parsed.endDate + "T23:59:59");
    for (
      let d = new Date(start.getTime());
      d <= end;
      d.setDate(d.getDate() + 1)
    ) {
      const dayOfWeek = WEEKDAY_ORDER[d.getDay()];
      if (!requestedDays.has(dayOfWeek)) continue;
      const y = d.getFullYear();
      const m = d.getMonth();
      const day = d.getDate();
      const dateStr = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const startsAt = new Date(y, m, day, sh, sm, 0, 0);
      const endsAt = new Date(y, m, day, eh, em, 0, 0);
      if (startsAt < now) continue;
      dates.push({ dateStr, startsAt, endsAt });
    }

    const created: Awaited<ReturnType<typeof prisma.session.create>>[] = [];
    for (const groupId of parsed.groupIds) {
      for (const { dateStr, startsAt, endsAt } of dates) {
        const title = parsed.titlePrefix
          ? `${parsed.titlePrefix.trim()} ${dateStr}`
          : null;
        const session = await prisma.session.create({
          data: {
            tenantId,
            groups: { connect: [{ id: groupId }] },
            startsAt,
            endsAt,
            title,
          },
        });
        created.push(session);

        if (parsed.assignmentUserIds?.length) {
          for (const userId of parsed.assignmentUserIds) {
            const user = await prisma.user.findFirst({
              where: {
                id: userId,
                OR: [
                  { tenantId },
                  { siteMemberships: { some: { tenantId } } },
                ],
              },
              select: { id: true },
            });
            if (!user) continue;
            try {
              await prisma.assignment.create({
                data: {
                  sessionId: session.id,
                  userId: user.id,
                  role: "TEACHER",
                  status: "CONFIRMED",
                },
              });
            } catch {
              // ignore duplicate or FK errors for this user
            }
          }
        }
      }
    }

    return { created };
  }

  async update(id: string, input: UpdateSessionDto, tenantId: string) {
    const changes = updateSessionSchema.parse(input);

    const current = await prisma.session.findFirst({
      where: { id, tenantId },
      select: { tenantId: true, startsAt: true, endsAt: true, groups: { select: { id: true } } },
    });
    if (!current) throw new NotFoundException("Session not found");

    if (changes.tenantId && changes.tenantId !== tenantId) {
      throw new BadRequestException("tenantId must match current tenant");
    }

    const groupIds =
      changes.groupIds !== undefined
        ? (changes.groupIds ?? [])
        : changes.groupId !== undefined
          ? (changes.groupId ? [changes.groupId] : [])
          : undefined;

    if (groupIds && groupIds.length) {
      const groups = await prisma.group.findMany({
        where: { id: { in: groupIds }, tenantId },
        select: { id: true },
      });
      const found = new Set(groups.map((g) => g.id));
      const missing = groupIds.filter((id) => !found.has(id));
      if (missing.length) throw new BadRequestException("group not found or wrong tenant");
    }

    const nextStarts = changes.startsAt ?? current.startsAt;
    const nextEnds = changes.endsAt ?? current.endsAt;
    if (nextEnds <= nextStarts)
      throw new BadRequestException("endsAt must be after startsAt");

    try {
      const updated = await prisma.session.update({
        where: { id },
        data: {
          tenantId: current.tenantId,
          ...(groupIds !== undefined
            ? { groups: { set: groupIds.map((id) => ({ id })) } }
            : {}),
          startsAt: nextStarts,
          endsAt: nextEnds,
          title:
            typeof changes.title === "undefined"
              ? undefined
              : (changes.title?.trim() ?? null),
        },
        include: { groups: { select: { id: true, name: true } } },
      });
      return updated;
    } catch (e) {
      this.handlePrismaError(e, "update");
    }
  }

  async delete(id: string, tenantId: string) {
    try {
      const existing = await prisma.session.findFirst({
        where: { id, tenantId },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException("Session not found");
      await prisma.session.delete({ where: { id } });
      return { id };
    } catch (e) {
      this.handlePrismaError(e, "delete");
    }
  }
}
