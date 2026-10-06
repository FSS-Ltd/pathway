import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { applyTenantContext, Prisma, runTransaction } from "@pathway/db";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import { OutboxService } from "../common/outbox/outbox.service";
import type { CreatePaceInventoryOrdersDto } from "./dto/create-pace-inventory-orders.dto";
import type { PaceQueryActor } from "./pace-query.service";

@Injectable()
export class PaceInventoryOrderCommandService {
  constructor(
    @Inject(OutboxService)
    private readonly outbox: OutboxService,
  ) {}

  async createOrders(
    actor: PaceQueryActor,
    command: CreatePaceInventoryOrdersDto,
  ): Promise<{ batchId: string; orderIds: string[]; created: number }> {
    if (!actor.tenantId || !actor.orgId || !actor.userId) {
      throw new BadRequestException("A complete active-site actor is required");
    }

    try {
      return await runTransaction(async (tx) => {
        await tx.$executeRawUnsafe(
          "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE",
        );
        await applyTenantContext(tx, actor.tenantId, actor.orgId);

        const site = await tx.tenant.findFirst({
          where: { id: actor.tenantId, orgId: actor.orgId },
          select: { id: true },
        });
        if (!site) throw new NotFoundException("Active site not found");

        const enrollment = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT enrollment.id
          FROM "StudentSubjectEnrollment" AS enrollment
          JOIN "Child" AS child
            ON child.id = enrollment."childId"
            AND child."tenantId" = enrollment."tenantId"
          JOIN "Subject" AS subject
            ON subject.id = enrollment."subjectId"
            AND subject."tenantId" = enrollment."tenantId"
          WHERE enrollment."tenantId" = ${actor.tenantId}
            AND enrollment."childId" = ${command.childId}
            AND enrollment."subjectId" = ${command.subjectId}
            AND enrollment.status = 'ACTIVE'
            AND child."isGuest" = false
            AND subject."isActive" = true
          FOR UPDATE OF enrollment
        `;
        if (enrollment.length === 0) {
          throw new NotFoundException(
            "Active student subject placement not found",
          );
        }

        const supplied = await tx.paceInventorySupply.findFirst({
          where: {
            tenantId: actor.tenantId,
            childId: command.childId,
            subjectId: command.subjectId,
            paceNumber: { in: command.paceNumbers },
          },
          select: { paceNumber: true },
        });
        if (supplied) {
          throw new ConflictException("A requested PACE is already supplied");
        }

        const pending = await tx.paceInventoryOrder.findFirst({
          where: {
            tenantId: actor.tenantId,
            childId: command.childId,
            subjectId: command.subjectId,
            paceNumber: { in: command.paceNumbers },
            status: { in: ["ORDERED", "IN_TRANSIT"] },
          },
          select: { paceNumber: true },
        });
        if (pending) {
          throw new ConflictException("A requested PACE is already on order");
        }

        const batchId = randomUUID();
        const orderIds = command.paceNumbers.map(() => randomUUID());
        await tx.paceInventoryOrder.createMany({
          data: command.paceNumbers.map((paceNumber, index) => ({
            id: orderIds[index],
            tenantId: actor.tenantId,
            childId: command.childId,
            subjectId: command.subjectId,
            paceNumber,
            createdByUserId: actor.userId,
          })),
        });
        await recordAuditEventInTransaction(tx, {
          actorUserId: actor.userId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          entityType: AuditEntityType.ACE_RECORD,
          entityId: batchId,
          action: AuditAction.CREATED,
          metadata: {
            event: "pace_inventory_orders_created",
            childId: command.childId,
            subjectId: command.subjectId,
            paceNumbers: command.paceNumbers,
            orderIds,
          },
        });
        await this.outbox.enqueue(tx, {
          aggregateType: "pace_inventory_order_batch",
          aggregateId: batchId,
          eventType: "ace.pace.inventory.orders.created",
          payload: {
            tenantId: actor.tenantId,
            childId: command.childId,
            subjectId: command.subjectId,
            orderIds,
          },
          idempotencyKey: `ace-pace-inventory-orders:${batchId}`,
        });

        return { batchId, orderIds, created: orderIds.length };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2002" || error.code === "P2034")
      ) {
        throw new ConflictException(
          "PACE inventory changed; refresh and retry",
        );
      }
      throw error;
    }
  }
}
