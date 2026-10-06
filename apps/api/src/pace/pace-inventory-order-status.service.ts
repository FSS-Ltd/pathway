import { randomUUID } from "node:crypto";
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import { OutboxService } from "../common/outbox/outbox.service";
import type { AdvancePaceInventoryOrderDto } from "./dto/advance-pace-inventory-order.dto";
import {
  lockActiveInventoryPlacement,
  withInventoryTenantTransaction,
} from "./pace-inventory-command-context";
import type { PaceQueryActor } from "./pace-query.service";

interface LockedOrder {
  id: string;
  childId: string;
  subjectId: string;
  paceNumber: number;
  status: "ORDERED" | "IN_TRANSIT" | "DELIVERED";
  orderedAt: Date;
  inTransitAt: Date | null;
}

@Injectable()
export class PaceInventoryOrderStatusService {
  constructor(
    @Inject(OutboxService)
    private readonly outbox: OutboxService,
  ) {}

  async advance(
    actor: PaceQueryActor,
    orderId: string,
    command: AdvancePaceInventoryOrderDto,
  ): Promise<{
    orderId: string;
    status: AdvancePaceInventoryOrderDto["status"];
    reachedAt: string;
    supplyId: string | null;
  }> {
    return withInventoryTenantTransaction(actor, async (tx) => {
      const [order] = await tx.$queryRaw<LockedOrder[]>`
        SELECT id, "childId", "subjectId", "paceNumber", status,
               "orderedAt", "inTransitAt"
        FROM "PaceInventoryOrder"
        WHERE id = ${orderId} AND "tenantId" = ${actor.tenantId}
        FOR UPDATE
      `;
      if (!order) throw new NotFoundException("PACE inventory order not found");

      const previousStatus =
        command.status === "IN_TRANSIT" ? "ORDERED" : "IN_TRANSIT";
      if (order.status !== previousStatus) {
        throw new ConflictException("PACE order cannot make that transition");
      }
      await lockActiveInventoryPlacement(tx, actor, order);

      const reachedAt = new Date(
        Math.max(
          Date.now(),
          order.orderedAt.getTime(),
          order.inTransitAt?.getTime() ?? 0,
        ),
      );
      const update = await tx.paceInventoryOrder.updateMany({
        where: {
          id: order.id,
          tenantId: actor.tenantId,
          status: previousStatus,
        },
        data:
          command.status === "IN_TRANSIT"
            ? { status: "IN_TRANSIT", inTransitAt: reachedAt }
            : { status: "DELIVERED", deliveredAt: reachedAt },
      });
      if (update.count !== 1) {
        throw new ConflictException("PACE order changed; refresh and retry");
      }

      let supplyId: string | null = null;
      if (command.status === "DELIVERED") {
        const existingSupply = await tx.paceInventorySupply.findFirst({
          where: {
            tenantId: actor.tenantId,
            childId: order.childId,
            subjectId: order.subjectId,
            paceNumber: order.paceNumber,
          },
          select: { id: true },
        });
        if (existingSupply) {
          throw new ConflictException("This PACE is already supplied");
        }
        supplyId = randomUUID();
        await tx.paceInventorySupply.create({
          data: {
            id: supplyId,
            tenantId: actor.tenantId,
            childId: order.childId,
            subjectId: order.subjectId,
            paceNumber: order.paceNumber,
            source: "DELIVERED_ORDER",
            sourceOrderId: order.id,
            createdByUserId: actor.userId,
          },
        });
      }

      await recordAuditEventInTransaction(tx, {
        actorUserId: actor.userId,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        entityType: AuditEntityType.ACE_RECORD,
        entityId: order.id,
        action: AuditAction.UPDATED,
        metadata: {
          event: "pace_inventory_order_advanced",
          fromStatus: previousStatus,
          toStatus: command.status,
          supplyId,
        },
      });
      await this.outbox.enqueue(tx, {
        aggregateType: "pace_inventory_order",
        aggregateId: order.id,
        eventType: "ace.pace.inventory.order.advanced",
        payload: {
          tenantId: actor.tenantId,
          orderId: order.id,
          status: command.status,
          supplyId,
        },
        idempotencyKey: `ace-pace-inventory-order:${order.id}:${command.status}`,
      });

      return {
        orderId: order.id,
        status: command.status,
        reachedAt: reachedAt.toISOString(),
        supplyId,
      };
    });
  }
}
