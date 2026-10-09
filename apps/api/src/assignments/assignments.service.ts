import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  Inject,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { prisma, Prisma, Role, AssignmentStatus, SiteRole } from "@pathway/db";
import { Av30ActivityType } from "@pathway/types/av30";
import { Av30ActivityService } from "../av30/av30-activity.service";
import { MailerService } from "../mailer/mailer.service";
import { CreateAssignmentDto } from "./dto/create-assignment.dto";
import { UpdateAssignmentDto } from "./dto/update-assignment.dto";
import { type TeamScheduleQueryDto } from "./dto/team-schedule-query.dto";
import { staffAtSite } from "../sessions/rota-access.service";

export type TeamScheduleRow = {
  assignmentId: string;
  sessionId: string;
  sessionTitle: string;
  startsAt: string;
  endsAt: string;
  groups: { id: string; name: string }[];
  staffId: string;
  staffName: string;
  role: Role;
  status: AssignmentStatus;
};

@Injectable()
export class AssignmentsService {
  constructor(
    @Optional()
    @Inject(Av30ActivityService)
    private readonly av30ActivityService: Av30ActivityService | undefined,
    @Inject(MailerService) private readonly mailerService: MailerService,
  ) {}

  /**
   * Create an assignment. Relies on DB FKs and the unique index
   * (sessionId, userId, role) to enforce integrity.
   */
  async create(dto: CreateAssignmentDto, tenantId: string, orgId: string) {
    const session = await prisma.session.findUnique({
      where: { id: dto.sessionId },
      select: { id: true, tenantId: true },
    });
    if (!session || session.tenantId !== tenantId)
      throw new NotFoundException("Assignment not found");

    const user = await prisma.user.findUnique({
      where: { id: dto.userId },
      select: {
        id: true,
        tenantId: true,
        siteMemberships: { where: { tenantId }, select: { tenantId: true } },
      },
    });
    if (!user) throw new NotFoundException("Assignment not found");
    const belongsToTenant =
      user.tenantId === tenantId ||
      user.siteMemberships.some((m) => m.tenantId === tenantId);
    if (!belongsToTenant) throw new NotFoundException("Assignment not found");

    try {
      const created = await prisma.assignment.create({
        data: {
          sessionId: dto.sessionId,
          userId: dto.userId,
          role: dto.role as Role,
          status: dto.status ?? AssignmentStatus.CONFIRMED,
        },
      });

      // Record AV30 activity: staff user was scheduled (assignment published)
      if (this.av30ActivityService) {
        await this.av30ActivityService
          .recordActivityWithIds(tenantId, orgId, {
            activityType: Av30ActivityType.ASSIGNMENT_PUBLISHED,
            staffUserId: dto.userId,
          })
          .catch((err) => {
            console.error(
              "Failed to record AV30 activity for assignment creation",
              err,
            );
          });
      }

      // When status is PENDING, notify staff by email (future: mobile push).
      // Must await so Prisma queries run inside the request's transaction (RLS context).
      const status = dto.status ?? AssignmentStatus.CONFIRMED;
      if (status === AssignmentStatus.PENDING) {
        await this.notifyStaffOfAssignment(
          created.id,
          dto.userId,
          dto.sessionId,
          this.mailerService,
        ).catch(() => {
          // Assignment already created; email is best-effort.
        });
      }

      return created;
    } catch (e) {
      this.handlePrismaError(e);
    }
  }

  /**
   * List assignments with optional filters.
   * dateFrom/dateTo filter by session.startsAt (inclusive day range).
   */
  async findAll(
    where: Prisma.AssignmentWhereInput & {
      tenantId: string;
      dateFrom?: string;
      dateTo?: string;
    },
  ) {
    const { tenantId, dateFrom, dateTo, ...rest } = where;
    const sessionWhere: Prisma.SessionWhereInput = { tenantId };
    if (dateFrom || dateTo) {
      sessionWhere.startsAt = {};
      if (dateFrom) {
        sessionWhere.startsAt.gte = new Date(dateFrom + "T00:00:00.000Z");
      }
      if (dateTo) {
        sessionWhere.startsAt.lte = new Date(dateTo + "T23:59:59.999Z");
      }
    }
    return prisma.assignment.findMany({
      where: {
        ...rest,
        session: sessionWhere,
      },
      orderBy: { createdAt: "desc" },
      include: {
        session: {
          select: {
            id: true,
            title: true,
            startsAt: true,
            endsAt: true,
            groups: { select: { id: true, name: true, color: true } },
          },
        },
        user: { select: { id: true, name: true } },
      },
    });
  }

  async findTeamSchedule(
    tenantId: string,
    { dateFrom, dateTo }: TeamScheduleQueryDto,
  ): Promise<TeamScheduleRow[]> {
    const end = new Date(`${dateTo}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    const assignments = await prisma.assignment.findMany({
      where: {
        status: { not: AssignmentStatus.DECLINED },
        session: {
          tenantId,
          startsAt: {
            gte: new Date(`${dateFrom}T00:00:00.000Z`),
            lt: end,
          },
        },
        user: { is: staffAtSite(tenantId) },
      },
      select: {
        id: true,
        userId: true,
        role: true,
        status: true,
        user: {
          select: {
            firstName: true,
            lastName: true,
            displayName: true,
            name: true,
          },
        },
        session: {
          select: {
            id: true,
            title: true,
            startsAt: true,
            endsAt: true,
            groups: { select: { id: true, name: true } },
          },
        },
      },
    });

    return assignments
      .map((assignment) => ({
        assignmentId: assignment.id,
        sessionId: assignment.session.id,
        sessionTitle: assignment.session.title ?? "Session",
        startsAt: assignment.session.startsAt.toISOString(),
        endsAt: assignment.session.endsAt.toISOString(),
        groups: assignment.session.groups,
        staffId: assignment.userId,
        staffName:
          [assignment.user.firstName, assignment.user.lastName]
            .filter(Boolean)
            .join(" ") ||
          assignment.user.displayName ||
          assignment.user.name ||
          "Staff member",
        role: assignment.role,
        status: assignment.status,
      }))
      .sort(
        (a, b) =>
          a.startsAt.localeCompare(b.startsAt) ||
          a.staffName.localeCompare(b.staffName),
      );
  }

  /**
   * Get a single assignment by id.
   */
  async findOne(id: string, tenantId: string) {
    const found = await prisma.assignment.findFirst({
      where: { id, session: { tenantId } },
    });
    if (!found) throw new NotFoundException("Assignment not found");
    return found;
  }

  /**
   * Update an assignment by id.
   * If currentUserId is set, staff can only update their own assignment unless they are site admin.
   */
  async update(
    id: string,
    dto: UpdateAssignmentDto,
    tenantId: string,
    orgId: string,
    currentUserId?: string,
  ) {
    const existing = await prisma.assignment.findFirst({
      where: { id, session: { tenantId } },
      select: { id: true, userId: true, status: true },
    });
    if (!existing) throw new NotFoundException("Assignment not found");

    if (currentUserId && existing.userId !== currentUserId) {
      const membership = await prisma.siteMembership.findFirst({
        where: {
          userId: currentUserId,
          tenantId,
          role: SiteRole.SITE_ADMIN,
        },
      });
      if (!membership) {
        throw new ForbiddenException(
          "You can only update your own assignment unless you are a site admin",
        );
      }
    }

    try {
      const updated = await prisma.assignment.update({
        where: { id },
        data: {
          // allow partial updates
          role: dto.role as Role | undefined,
          status: dto.status as AssignmentStatus | undefined,
        },
      });

      // Record AV30 activity if status changed to ACCEPTED or DECLINED
      if (
        this.av30ActivityService &&
        dto.status &&
        dto.status !== existing.status
      ) {
        if (dto.status === AssignmentStatus.CONFIRMED) {
          await this.av30ActivityService
            .recordActivityWithIds(tenantId, orgId, {
              activityType: Av30ActivityType.ASSIGNMENT_ACCEPTED,
              staffUserId: existing.userId,
            })
            .catch((err) => {
              console.error(
                "Failed to record AV30 activity for assignment acceptance",
                err,
              );
            });
        } else if (dto.status === AssignmentStatus.DECLINED) {
          await this.av30ActivityService
            .recordActivityWithIds(tenantId, orgId, {
              activityType: Av30ActivityType.ASSIGNMENT_DECLINED,
              staffUserId: existing.userId,
            })
            .catch((err) => {
              console.error(
                "Failed to record AV30 activity for assignment decline",
                err,
              );
            });
        }
      }

      return updated;
    } catch (e) {
      this.handlePrismaError(e, id);
    }
  }

  /**
   * Delete an assignment by id.
   */
  async remove(id: string, tenantId: string) {
    const existing = await prisma.assignment.findFirst({
      where: { id, session: { tenantId } },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException("Assignment not found");

    try {
      return await prisma.assignment.delete({ where: { id } });
    } catch (e) {
      this.handlePrismaError(e, id);
    }
  }

  /**
   * Send email to staff when assigned with PENDING status (future: add mobile push).
   */
  private async notifyStaffOfAssignment(
    _assignmentId: string,
    userId: string,
    sessionId: string,
    mailer: MailerService,
  ): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true, name: true },
    });
    if (!user?.email) return;

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        title: true,
        startsAt: true,
        tenant: { select: { org: { select: { name: true } } } },
      },
    });
    if (!session) return;

    const staffName = user.displayName?.trim() || user.name?.trim() || "Staff";
    const sessionTitle = session.title?.trim() || "Session";
    const sessionStartsAt = session.startsAt
      ? new Date(session.startsAt).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "";
    const adminUrl =
      process.env.ADMIN_URL ||
      process.env.ADMIN_BASE_URL ||
      "https://app.nexsteps.dev";
    const acceptUrl = `${adminUrl.replace(/\/$/, "")}/my-schedule`;
    const orgName = session.tenant?.org?.name ?? undefined;

    await mailer.sendShiftAssignmentNotification({
      to: user.email,
      staffName,
      sessionTitle,
      sessionStartsAt,
      acceptUrl,
      orgName,
    });
  }

  private handlePrismaError(error: unknown, id?: string): never {
    if (error && typeof error === "object" && "code" in error) {
      const err = error as Prisma.PrismaClientKnownRequestError;
      // Unique constraint (sessionId, userId, role)
      if (err.code === "P2002") {
        throw new BadRequestException(
          "An assignment for this user, role and session already exists",
        );
      }
      // Foreign key violation
      if (err.code === "P2003") {
        throw new BadRequestException(
          "Invalid foreign key: sessionId or userId",
        );
      }
      // Record to update/delete not found
      if (err.code === "P2025") {
        throw new NotFoundException(
          id ? `Assignment ${id} not found` : "Assignment not found",
        );
      }
      // Include Prisma message for other known codes (e.g. P2011 null, P2014 relation)
      const msg =
        typeof (err as { message?: string }).message === "string"
          ? (err as { message: string }).message
          : "Unable to process assignment operation";
      console.error(
        `AssignmentsService Prisma error ${err.code}:`,
        msg,
        (err as { meta?: unknown }).meta,
      );
      throw new BadRequestException(msg);
    }
    const msg =
      error instanceof Error
        ? error.message
        : "Unable to process assignment operation";
    console.error("AssignmentsService unexpected error:", error);
    throw new BadRequestException(msg);
  }
}
