import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Inject,
} from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import type { Prisma } from "@prisma/client";
import type { CreateConcernDto, UpdateConcernDto } from "./dto";
import { AuditService } from "../audit/audit.service";
import type { SafeguardingContextIds } from "../common/safeguarding/safeguarding.types";
import { AuditAction, AuditEntityType } from "../audit/audit.types";

// Simple filters for list queries
// - childId optional to scope to a specific child
// Other filters can be added as needed

type ConcernFilters = {
  childId?: string;
};

@Injectable()
export class ConcernsService {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  async create(dto: CreateConcernDto, context: SafeguardingContextIds) {
    return this.withContext(context, async (tx) => {
      // Validate FK: child must exist for this tenant
      const child = await tx.child.findFirst({
        where: {
          id: dto.childId,
          tenantId: context.tenantId,
        },
        select: { id: true },
      });
      if (!child) throw new NotFoundException("Child not found");

      try {
        const concern = await tx.concern.create({
          data: {
            childId: dto.childId,
            summary: dto.summary,
            details: dto.details ?? undefined,
          },
        });
        await this.audit.recordEvent({
          actorUserId: context.actorUserId,
          tenantId: context.tenantId,
          orgId: context.orgId,
          entityType: AuditEntityType.CONCERN,
          entityId: concern.id,
          action: AuditAction.CREATED,
          metadata: { childId: dto.childId },
        });
        return concern;
      } catch (e: unknown) {
        this.handlePrismaError(e, "create");
      }
    });
  }

  async findAll(filters: ConcernFilters = {}, context: SafeguardingContextIds) {
    return this.withContext(context, async (tx) => {
      const where: Prisma.ConcernWhereInput = {
        child: { tenantId: context.tenantId },
        ...(filters.childId ? { childId: filters.childId } : {}),
        deletedAt: null,
      };
      const records = await tx.concern.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          child: { select: { firstName: true, lastName: true } },
        },
      });
      await this.audit.recordEvent({
        actorUserId: context.actorUserId,
        tenantId: context.tenantId,
        orgId: context.orgId,
        entityType: AuditEntityType.CONCERN,
        entityId: null,
        action: AuditAction.VIEWED,
        metadata: {
          filterChildId: filters.childId ?? null,
          resultCount: records.length,
        },
      });
      return records;
    });
  }

  async findOne(id: string, context: SafeguardingContextIds) {
    return this.withContext(context, async (tx) => {
      const concern = await this.requireConcernForTenant(
        id,
        context.tenantId,
        tx,
      );
      await this.audit.recordEvent({
        actorUserId: context.actorUserId,
        tenantId: context.tenantId,
        orgId: context.orgId,
        entityType: AuditEntityType.CONCERN,
        entityId: id,
        action: AuditAction.VIEWED,
        metadata: { childId: concern.childId },
      });
      return concern;
    });
  }

  async update(
    id: string,
    dto: UpdateConcernDto,
    context: SafeguardingContextIds,
  ) {
    return this.withContext(context, async (tx) => {
      await this.requireConcernForTenant(id, context.tenantId, tx);
      try {
        const concern = await tx.concern.update({
          where: { id },
          data: {
            summary: dto.summary ?? undefined,
            details: dto.details ?? undefined,
          },
        });
        await this.audit.recordEvent({
          actorUserId: context.actorUserId,
          tenantId: context.tenantId,
          orgId: context.orgId,
          entityType: AuditEntityType.CONCERN,
          entityId: id,
          action: AuditAction.UPDATED,
          metadata: {
            updatedFields: Object.keys(dto ?? {}),
          },
        });
        return concern;
      } catch (e: unknown) {
        this.handlePrismaError(e, "update", id);
      }
    });
  }

  async remove(id: string, context: SafeguardingContextIds) {
    return this.withContext(context, async (tx) => {
      const concern = await this.requireConcernForTenant(
        id,
        context.tenantId,
        tx,
      );
      try {
        const deleted = await tx.concern.update({
          where: { id },
          data: { deletedAt: new Date() },
        });
        await this.audit.recordEvent({
          actorUserId: context.actorUserId,
          tenantId: context.tenantId,
          orgId: context.orgId,
          entityType: AuditEntityType.CONCERN,
          entityId: id,
          action: AuditAction.DELETED,
          metadata: { childId: concern.childId },
        });
        return { id: deleted.id, deletedAt: deleted.deletedAt };
      } catch (e: unknown) {
        this.handlePrismaError(e, "delete", id);
      }
    });
  }

  private async requireConcernForTenant(
    id: string,
    tenantId: string,
    tx: Prisma.TransactionClient,
  ) {
    const concern = await tx.concern.findFirst({
      where: {
        id,
        child: { tenantId },
        deletedAt: null,
      },
      include: {
        child: { select: { firstName: true, lastName: true } },
      },
    });
    if (!concern) throw new NotFoundException("Concern not found");
    return concern;
  }

  private withContext<T>(
    context: SafeguardingContextIds,
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    if (!context.tenantId) {
      throw new BadRequestException(
        "No active site selected. Choose a site to view safeguarding concerns.",
      );
    }
    return withTenantRlsContext(context.tenantId, context.orgId, async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.user_id', $1, true)`,
        context.actorUserId ?? "",
      );
      return callback(tx);
    });
  }

  private handlePrismaError(
    e: unknown,
    action: "create" | "update" | "delete",
    id?: string,
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
      throw new NotFoundException(
        id ? `Concern with id ${id} not found` : "Concern not found",
      );
    }
    if (code === "P2003") {
      throw new BadRequestException(
        `Invalid reference for concern ${action}: ${message}`,
      );
    }
    if (code === "P2002") {
      throw new BadRequestException(
        `Duplicate value violates a unique constraint: ${message}`,
      );
    }
    throw new BadRequestException(`Failed to ${action} concern: ${message}`);
  }
}
