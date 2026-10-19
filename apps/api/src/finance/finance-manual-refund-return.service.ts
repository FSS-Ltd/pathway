import { ConflictException, Inject, Injectable } from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { FinanceAccessService } from "./access/finance-access.service";
import {
  FinanceCommandService,
  type FinanceCommandActor,
} from "./finance-command.service";
import { lockReceipt } from "./finance-receipt-operations";
import { recordFinanceReceiptMovement } from "./finance-receipt-movement.service";
import { toFinanceRefundView } from "./finance-refund-records";
import {
  loadFinanceRefund,
  lockFinanceRefund,
} from "./finance-refund.persistence";
import type {
  FinanceManualRefundReturnRequestInput,
  FinanceRefundDecisionInput,
} from "./dto/finance-refund.dto";
import type { FinanceRefundActor } from "./finance-refund.service";

@Injectable()
export class FinanceManualRefundReturnService {
  constructor(
    @Inject(FinanceAccessService)
    private readonly financeAccess: FinanceAccessService,
    @Inject(FinanceCommandService)
    private readonly commands: FinanceCommandService,
  ) {}

  async requestManualReturn(
    actor: FinanceRefundActor,
    refundId: string,
    idempotencyKey: string,
    input: FinanceManualRefundReturnRequestInput,
  ) {
    await this.financeAccess.assertStaffAction(actor, "REFUND");
    const bankTransactionReference = input.bankTransactionReference.trim();
    const reason = input.reason.trim();
    const commandActor: FinanceCommandActor = actor;
    return this.commands.execute({
      actor: commandActor,
      idempotencyKey,
      commandType: "REQUEST_REFUND_RETURN",
      resourceType: "REFUND",
      request: { refundId, bankTransactionReference, reason },
      perform: async (tx) => {
        let refund = await this.loadRefund(tx, actor, refundId);
        await lockReceipt(tx, actor, refund.receiptId);
        await lockFinanceRefund(tx, actor, refundId);
        refund = await this.loadRefund(tx, actor, refundId);
        if (
          refund.source !== "MANUAL_TRANSFER" ||
          refund.status !== "CONFIRMED"
        ) {
          throw new ConflictException(
            "Only confirmed manual transfer refunds can have a return recorded",
          );
        }
        const latestReturnEvent = await this.latestManualReturnEvent(
          tx,
          actor,
          refundId,
        );
        if (latestReturnEvent?.type === "RETURN_REQUESTED") {
          throw new ConflictException(
            "A manual refund return is already awaiting review",
          );
        }
        const duplicateReference = await tx.financeRefundEvent.findFirst({
          where: {
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            type: "RETURN_REQUESTED",
            sourceReference: bankTransactionReference,
          },
          select: { id: true },
        });
        if (duplicateReference) {
          throw new ConflictException(
            "Bank reference is already recorded for another manual return",
          );
        }
        await tx.financeRefundEvent.create({
          data: {
            refundId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            actorUserId: actor.userId,
            sourceReference: bankTransactionReference,
            type: "RETURN_REQUESTED",
            reason,
          },
        });
        return {
          resourceId: refundId,
          value: toFinanceRefundView(
            await this.loadRefund(tx, actor, refundId),
          ),
        };
      },
      replay: async (tx, resourceId) =>
        toFinanceRefundView(await this.loadRefund(tx, actor, resourceId)),
    });
  }

  async approveManualReturn(
    actor: FinanceRefundActor,
    refundId: string,
    idempotencyKey: string,
    input: FinanceRefundDecisionInput,
  ) {
    const requester = await withTenantRlsContext(
      actor.tenantId,
      actor.orgId,
      async (tx) => {
        const refund = await this.loadRefund(tx, actor, refundId);
        const request = await this.latestManualReturnRequest(
          tx,
          actor,
          refundId,
        );
        if (refund.source !== "MANUAL_TRANSFER" || !request?.actorUserId) {
          throw new ConflictException(
            "A pending manual refund return request is required",
          );
        }
        return request.actorUserId;
      },
    );
    await this.financeAccess.authorizeIndependentFinanceApproval(
      actor,
      requester,
      actor.userId,
      "REFUND",
    );
    const commandActor: FinanceCommandActor = actor;
    return this.commands.execute({
      actor: commandActor,
      idempotencyKey,
      commandType: "APPROVE_REFUND_RETURN",
      resourceType: "REFUND",
      request: { refundId, reason: input.reason.trim() },
      perform: async (tx) => {
        let refund = await this.loadRefund(tx, actor, refundId);
        await lockReceipt(tx, actor, refund.receiptId);
        await lockFinanceRefund(tx, actor, refundId);
        refund = await this.loadRefund(tx, actor, refundId);
        const request = await this.latestManualReturnEvent(tx, actor, refundId);
        if (
          refund.source !== "MANUAL_TRANSFER" ||
          refund.status !== "CONFIRMED" ||
          request?.type !== "RETURN_REQUESTED" ||
          !request.actorUserId
        ) {
          throw new ConflictException(
            "A pending manual refund return request is required",
          );
        }
        const originalMovement = await tx.financeReceiptMovement.findFirst({
          where: {
            refundId,
            receiptId: refund.receiptId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            type: "REFUND",
            source: "MANUAL_TRANSFER",
          },
          select: { id: true, amountMinor: true, currency: true },
        });
        if (!originalMovement || !request.sourceReference) {
          throw new ConflictException(
            "Manual refund return is missing its bank evidence",
          );
        }

        await this.financeAccess.authorizeIndependentFinanceApproval(
          actor,
          request.actorUserId,
          actor.userId,
          "REFUND",
        );
        const returnedAt = new Date();
        await tx.financeRefund.updateMany({
          where: {
            id: refundId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            status: "CONFIRMED",
          },
          data: { status: "RETURNED", returnedAt },
        });
        await tx.financeRefundEvent.createMany({
          data: [
            {
              refundId,
              tenantId: actor.tenantId,
              orgId: actor.orgId,
              actorUserId: actor.userId,
              sourceReference: request.sourceReference,
              type: "RETURN_APPROVED",
              reason: input.reason.trim(),
            },
            {
              refundId,
              tenantId: actor.tenantId,
              orgId: actor.orgId,
              actorUserId: actor.userId,
              sourceReference: request.sourceReference,
              type: "RETURNED",
              reason: "Manual refund return confirmed",
            },
          ],
        });
        await recordFinanceReceiptMovement(tx, {
          financeProfileId: refund.financeProfileId,
          receiptId: refund.receiptId,
          refundId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          type: "REFUND_RETURN",
          source: "MANUAL_TRANSFER",
          amountMinor: originalMovement.amountMinor,
          currency: originalMovement.currency,
          sourceReference: request.sourceReference,
          originalMovementId: originalMovement.id,
          occurredAt: returnedAt,
          recordedByUserId: actor.userId,
        });
        return {
          resourceId: refundId,
          value: toFinanceRefundView(
            await this.loadRefund(tx, actor, refundId),
          ),
        };
      },
      replay: async (tx, resourceId) =>
        toFinanceRefundView(await this.loadRefund(tx, actor, resourceId)),
    });
  }

  async rejectManualReturn(
    actor: FinanceRefundActor,
    refundId: string,
    idempotencyKey: string,
    input: FinanceRefundDecisionInput,
  ) {
    const requester = await withTenantRlsContext(
      actor.tenantId,
      actor.orgId,
      async (tx) => {
        const refund = await this.loadRefund(tx, actor, refundId);
        const request = await this.latestManualReturnRequest(
          tx,
          actor,
          refundId,
        );
        if (refund.source !== "MANUAL_TRANSFER" || !request?.actorUserId) {
          throw new ConflictException(
            "A pending manual refund return request is required",
          );
        }
        return request.actorUserId;
      },
    );
    await this.financeAccess.authorizeIndependentFinanceApproval(
      actor,
      requester,
      actor.userId,
      "REFUND",
    );
    const commandActor: FinanceCommandActor = actor;
    return this.commands.execute({
      actor: commandActor,
      idempotencyKey,
      commandType: "REJECT_REFUND_RETURN",
      resourceType: "REFUND",
      request: { refundId, reason: input.reason.trim() },
      perform: async (tx) => {
        let refund = await this.loadRefund(tx, actor, refundId);
        await lockReceipt(tx, actor, refund.receiptId);
        await lockFinanceRefund(tx, actor, refundId);
        refund = await this.loadRefund(tx, actor, refundId);
        const request = await this.latestManualReturnEvent(tx, actor, refundId);
        if (
          refund.source !== "MANUAL_TRANSFER" ||
          refund.status !== "CONFIRMED" ||
          request?.type !== "RETURN_REQUESTED" ||
          !request.actorUserId
        ) {
          throw new ConflictException(
            "A pending manual refund return request is required",
          );
        }
        await this.financeAccess.authorizeIndependentFinanceApproval(
          actor,
          request.actorUserId,
          actor.userId,
          "REFUND",
        );
        await tx.financeRefundEvent.create({
          data: {
            refundId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            actorUserId: actor.userId,
            sourceReference: request.sourceReference,
            type: "RETURN_REJECTED",
            reason: input.reason.trim(),
          },
        });
        return {
          resourceId: refundId,
          value: toFinanceRefundView(
            await this.loadRefund(tx, actor, refundId),
          ),
        };
      },
      replay: async (tx, resourceId) =>
        toFinanceRefundView(await this.loadRefund(tx, actor, resourceId)),
    });
  }

  private async loadRefund(
    tx: Prisma.TransactionClient,
    actor: FinanceRefundActor,
    refundId: string,
  ) {
    return loadFinanceRefund(tx, actor, refundId);
  }

  private async latestManualReturnEvent(
    tx: Prisma.TransactionClient,
    actor: FinanceRefundActor,
    refundId: string,
  ) {
    const request = await this.latestManualReturnRequest(tx, actor, refundId);
    if (!request) return null;
    const resolution = await tx.financeRefundEvent.findFirst({
      where: {
        refundId,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        type: {
          in: ["RETURN_APPROVED", "RETURN_REJECTED"],
        },
        sourceReference: request.sourceReference,
        createdAt: { gte: request.createdAt },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { type: true },
    });
    return resolution ? { ...request, type: resolution.type } : request;
  }

  private async latestManualReturnRequest(
    tx: Prisma.TransactionClient,
    actor: FinanceRefundActor,
    refundId: string,
  ) {
    return tx.financeRefundEvent.findFirst({
      where: {
        refundId,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        type: "RETURN_REQUESTED",
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        type: true,
        sourceReference: true,
        actorUserId: true,
        createdAt: true,
      },
    });
  }
}
