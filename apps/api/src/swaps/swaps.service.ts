import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import {
  prisma,
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

function staffAtSite(userId: string, tenantId: string) {
  return {
    id: userId,
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
        select: { id: true, userId: true },
      }),
      prisma.user.findFirst({
        where: staffAtSite(dto.fromUserId, tenantId),
        select: { id: true },
      }),
      dto.toUserId
        ? prisma.user.findFirst({
            where: staffAtSite(dto.toUserId, tenantId),
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);

    if (!assignment) throw new NotFoundException("Assignment not found");
    if (assignment.userId !== dto.fromUserId) {
      throw new BadRequestException("Requester must hold the assignment");
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
          where: staffAtSite(nextToUserId, tenantId),
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
