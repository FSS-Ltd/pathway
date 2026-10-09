import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import {
  prisma,
  type Prisma,
  AssignmentStatus,
  Role,
  SiteRole,
  SwapStatus,
  withTenantRlsContext,
} from "@pathway/db";
import { CreateSwapDto, UpdateSwapDto } from "./dto";

const staffRoles = [
  Role.ADMIN,
  Role.COORDINATOR,
  Role.TEACHER,
  Role.LEAD,
  Role.SUPPORT,
];

function staffAtSite(tenantId: string, userId?: string): Prisma.UserWhereInput {
  return {
    ...(userId ? { id: userId } : {}),
    isActive: true,
    OR: [
      {
        siteMemberships: {
          some: {
            tenantId,
            role: { in: [SiteRole.STAFF, SiteRole.SITE_ADMIN] },
          },
        },
      },
      {
        roles: { some: { tenantId, role: { in: staffRoles } } },
      },
    ],
  };
}

@Injectable()
export class SwapsService {
  /**
   * Create a swap request. Validates related records exist and basic invariants.
   */
  async create(dto: CreateSwapDto, tenantId: string) {
    if (dto.status && dto.status !== SwapStatus.REQUESTED) {
      throw new BadRequestException("A new swap must be requested first");
    }
    if (dto.toUserId === dto.fromUserId) {
      throw new BadRequestException("A swap requires another staff member");
    }

    // Validate foreign keys
    const [assignment, fromUser, toUser] = await Promise.all([
      prisma.assignment.findFirst({
        where: { id: dto.assignmentId, session: { tenantId } },
        select: { id: true, userId: true, status: true },
      }),
      prisma.user.findFirst({
        where: staffAtSite(tenantId, dto.fromUserId),
        select: { id: true },
      }),
      dto.toUserId
        ? prisma.user.findFirst({
            where: staffAtSite(tenantId, dto.toUserId),
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);

    if (!assignment) throw new NotFoundException("Assignment not found");
    if (assignment.userId !== dto.fromUserId) {
      throw new BadRequestException("Requester must hold the assignment");
    }
    if (assignment.status === AssignmentStatus.DECLINED) {
      throw new BadRequestException("A declined assignment cannot be swapped");
    }
    if (!fromUser) throw new NotFoundException("fromUser not found");
    if (dto.toUserId && !toUser)
      throw new NotFoundException("toUser not found");

    return prisma.swapRequest.create({
      data: {
        assignmentId: dto.assignmentId,
        fromUserId: dto.fromUserId,
        toUserId: dto.toUserId ?? null,
        status: dto.status ?? SwapStatus.REQUESTED,
      },
    });
  }

  /** Only the assignment holder can discover active staff at its site for a swap. */
  async findCandidates(assignmentId: string, userId: string, tenantId: string) {
    const assignment = await prisma.assignment.findFirst({
      where: { id: assignmentId, userId, session: { tenantId } },
      select: { sessionId: true, status: true },
    });
    if (!assignment || assignment.status === AssignmentStatus.DECLINED) {
      throw new NotFoundException("Assignment not found");
    }

    const [assignedStaff, staff] = await Promise.all([
      prisma.assignment.findMany({
        where: { sessionId: assignment.sessionId },
        select: { userId: true },
      }),
      prisma.user.findMany({
        where: staffAtSite(tenantId),
        select: {
          id: true,
          firstName: true,
          lastName: true,
          name: true,
          displayName: true,
        },
      }),
    ]);
    const assignedIds = new Set(assignedStaff.map((row) => row.userId));
    return staff
      .filter((person) => person.id !== userId && !assignedIds.has(person.id))
      .map((person) => ({
        id: person.id,
        fullName:
          [person.firstName, person.lastName].filter(Boolean).join(" ") ||
          person.displayName ||
          person.name ||
          "Staff member",
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  /**
   * List swap requests with optional filters.
   */
  async findAll(filter: {
    tenantId: string;
    assignmentId?: string;
    fromUserId?: string;
    toUserId?: string;
    status?: SwapStatus;
    participantUserId?: string;
  }) {
    return prisma.swapRequest.findMany({
      where: {
        assignmentId: filter?.assignmentId,
        fromUserId: filter?.fromUserId,
        toUserId: filter?.toUserId,
        status: filter?.status,
        ...(filter.participantUserId
          ? {
              OR: [
                { fromUserId: filter.participantUserId },
                { toUserId: filter.participantUserId },
              ],
            }
          : {}),
        assignment: { session: { tenantId: filter.tenantId } },
      },
      orderBy: { createdAt: "desc" },
      include: {
        assignment: {
          select: {
            session: {
              select: { title: true, startsAt: true, endsAt: true },
            },
          },
        },
        fromUser: { select: { name: true } },
        toUser: { select: { name: true } },
      },
    });
  }

  /**
   * Get one swap request by id.
   */
  async findOne(id: string, tenantId: string) {
    const found = await prisma.swapRequest.findFirst({
      where: { id, assignment: { session: { tenantId } } },
    });
    if (!found) throw new NotFoundException("SwapRequest not found");
    return found;
  }

  /**
   * Update a swap request.
   */
  async update(
    id: string,
    dto: UpdateSwapDto,
    tenantId: string,
    orgId: string,
  ) {
    return withTenantRlsContext(tenantId, orgId, async () => {
      const existing = await prisma.swapRequest.findFirst({
        where: { id, assignment: { session: { tenantId } } },
      });
      if (!existing) throw new NotFoundException("SwapRequest not found");
      if (existing.status !== SwapStatus.REQUESTED) {
        throw new ConflictException("Swap request is no longer open");
      }

      const nextToUserId = dto.toUserId ?? existing.toUserId ?? null;
      if (nextToUserId === existing.fromUserId) {
        throw new BadRequestException("A swap requires another staff member");
      }
      if (dto.status === SwapStatus.ACCEPTED && !nextToUserId) {
        throw new BadRequestException(
          "toUserId is required when status is ACCEPTED",
        );
      }
      if (
        nextToUserId &&
        (dto.toUserId || dto.status === SwapStatus.ACCEPTED)
      ) {
        const toUser = await prisma.user.findFirst({
          where: staffAtSite(tenantId, nextToUserId),
        });
        if (!toUser) throw new NotFoundException("toUser not found");
      }

      const claimed = await prisma.swapRequest.updateMany({
        where: {
          id,
          status: SwapStatus.REQUESTED,
          assignment: { session: { tenantId } },
        },
        data: {
          toUserId: dto.toUserId,
          status: dto.status,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException("Swap request is no longer open");
      }

      if (dto.status === SwapStatus.ACCEPTED && nextToUserId) {
        const reassigned = await prisma.assignment.updateMany({
          where: {
            id: existing.assignmentId,
            userId: existing.fromUserId,
            status: { not: AssignmentStatus.DECLINED },
            session: { tenantId },
          },
          data: { userId: nextToUserId },
        });
        if (reassigned.count !== 1) {
          throw new ConflictException(
            "Assignment is no longer held by requester",
          );
        }
      }

      return this.findOne(id, tenantId);
    });
  }

  /**
   * Delete a swap request.
   */
  async remove(id: string, tenantId: string) {
    const existing = await prisma.swapRequest.findFirst({
      where: { id, assignment: { session: { tenantId } } },
    });
    if (!existing) throw new NotFoundException("SwapRequest not found");

    await prisma.swapRequest.deleteMany({
      where: { id, assignment: { session: { tenantId } } },
    });

    return existing;
  }
}
