import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import { OutboxService } from "../common/outbox/outbox.service";
import type { PaceInventoryBulkDto } from "./dto/pace-inventory-bulk.dto";
import { withAvailableInventoryPlacement } from "./pace-inventory-command-context";
import type { PaceQueryActor } from "./pace-query.service";

@Injectable()
export class PaceInventoryStockCommandService {
  constructor(
    @Inject(OutboxService)
    private readonly outbox: OutboxService,
  ) {}

  async addCurrentStock(
    actor: PaceQueryActor,
    command: PaceInventoryBulkDto,
  ): Promise<{ batchId: string; supplyIds: string[]; created: number }> {
    return withAvailableInventoryPlacement(actor, command, async (tx) => {
      const batchId = randomUUID();
      const supplyIds = command.paceNumbers.map(() => randomUUID());
      await tx.paceInventorySupply.createMany({
        data: command.paceNumbers.map((paceNumber, index) => ({
          id: supplyIds[index],
          tenantId: actor.tenantId,
          childId: command.childId,
          subjectId: command.subjectId,
          paceNumber,
          source: "CURRENT_STOCK",
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
          event: "pace_inventory_current_stock_added",
          childId: command.childId,
          subjectId: command.subjectId,
          paceNumbers: command.paceNumbers,
          supplyIds,
        },
      });
      await this.outbox.enqueue(tx, {
        aggregateType: "pace_inventory_supply_batch",
        aggregateId: batchId,
        eventType: "ace.pace.inventory.current-stock.added",
        payload: {
          tenantId: actor.tenantId,
          childId: command.childId,
          subjectId: command.subjectId,
          supplyIds,
        },
        idempotencyKey: `ace-pace-inventory-current-stock:${batchId}`,
      });

      return { batchId, supplyIds, created: supplyIds.length };
    });
  }
}
