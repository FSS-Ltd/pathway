import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { FinanceAccessService } from "./access/finance-access.service";
import type { FinanceAccessScope } from "./access/finance-access.reader";
import {
  FinanceCommandService,
  type FinanceCommandActor,
} from "./finance-command.service";
import { lockReceipt, parsePositiveAmount } from "./finance-receipt-operations";
import { recordFinanceReceiptMovement } from "./finance-receipt-movement.service";
import {
  financeRefundInclude,
  toFinanceRefundView,
} from "./finance-refund-records";
import {
  loadFinanceRefund,
  lockFinanceRefund,
} from "./finance-refund.persistence";
import type {
  FinanceManualRefundConfirmationInput,
  FinanceRefundDecisionInput,
  FinanceRefundListQuery,
  FinanceRefundRequestInput,
} from "./dto/finance-refund.dto";
import { FinanceStripeRefundSubmissionService } from "./stripe/finance-stripe-refund-submission.service";

export interface FinanceRefundActor extends FinanceAccessScope {
  userId: string;
}

@Injectable()
export class FinanceRefundService {
  constructor(
    @Inject(FinanceAccessService)
    private readonly financeAccess: FinanceAccessService,
    @Inject(FinanceCommandService)
    private readonly commands: FinanceCommandService,
    @Inject(FinanceStripeRefundSubmissionService)
    private readonly stripeRefundSubmission: FinanceStripeRefundSubmissionService,
  ) {}

  async list(actor: FinanceRefundActor, query: FinanceRefundListQuery) {
    await this.financeAccess.assertStaffAction(actor, "READ_RECORDS");
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const refunds = await tx.financeRefund.findMany({
        where: {
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          status: query.status,
          receiptId: query.receiptId,
        },
        include: financeRefundInclude,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: query.limit,
      });
      return { items: refunds.map(toFinanceRefundView) };
    });
  }

  async get(actor: FinanceRefundActor, refundId: string) {
    await this.financeAccess.assertStaffAction(actor, "READ_RECORDS");
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) =>
      toFinanceRefundView(await this.loadRefund(tx, actor, refundId)),
    );
  }

  async request(
    actor: FinanceRefundActor,
    receiptId: string,
    idempotencyKey: string,
    input: FinanceRefundRequestInput,
  ) {
    await this.financeAccess.assertStaffAction(actor, "REFUND");
    const amountMinor = parsePositiveAmount(input.amountMinor);
    const reason = input.reason.trim();
    if (!reason) throw new BadRequestException("Refund reason is required");
    const commandActor: FinanceCommandActor = actor;
    return this.commands.execute({
      actor: commandActor,
      idempotencyKey,
      commandType: "REQUEST_REFUND",
      resourceType: "REFUND",
      request: { receiptId, amountMinor: input.amountMinor, reason },
      perform: async (tx) => {
        await lockReceipt(tx, actor, receiptId);
        const receipt = await tx.financeReceipt.findFirst({
          where: {
            id: receiptId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
          },
          select: {
            id: true,
            financeProfileId: true,
            payerAccountId: true,
            amountMinor: true,
            currency: true,
            source: true,
            sourceReference: true,
            status: true,
          },
        });
        if (!receipt) throw new NotFoundException("Finance receipt not found");
        if (receipt.status !== "CONFIRMED" || !receipt.payerAccountId) {
          throw new ConflictException(
            "Only confirmed payer receipts can be refunded",
          );
        }

        const source = refundSourceForReceipt(receipt.source);
        const stripeFacts =
          source === "STRIPE_CARD"
            ? await this.findStripeReceiptFacts(tx, actor, receipt)
            : null;
        const [movements, reservedRefunds] = await Promise.all([
          tx.financeReceiptMovement.findMany({
            where: {
              receiptId,
              tenantId: actor.tenantId,
              orgId: actor.orgId,
            },
            select: { amountMinor: true, type: true },
          }),
          tx.financeRefund.aggregate({
            where: {
              receiptId,
              tenantId: actor.tenantId,
              orgId: actor.orgId,
              status: { in: ["PENDING", "APPROVED", "SUBMITTED"] },
            },
            _sum: { amountMinor: true },
          }),
        ]);
        const netMovementOutflow = movements.reduce((sum, movement) => {
          const isReturn =
            movement.type === "REFUND_RETURN" ||
            movement.type === "DISPUTE_REINSTATEMENT";
          return (
            sum + (isReturn ? -movement.amountMinor : movement.amountMinor)
          );
        }, 0n);
        const remainingMinor =
          receipt.amountMinor -
          netMovementOutflow -
          (reservedRefunds._sum.amountMinor ?? 0n);
        if (remainingMinor <= 0n || amountMinor > remainingMinor) {
          throw new ConflictException(
            "Refund exceeds the remaining confirmed receipt amount",
          );
        }

        const refund = await tx.financeRefund.create({
          data: {
            financeProfileId: receipt.financeProfileId,
            receiptId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            requestedByUserId: actor.userId,
            source,
            amountMinor,
            currency: receipt.currency,
            reason,
            stripeAccountId: stripeFacts?.stripeAccountId,
            events: {
              create: {
                actorUserId: actor.userId,
                type: "REQUESTED",
                reason,
              },
            },
          },
          select: { id: true },
        });
        return {
          resourceId: refund.id,
          value: toFinanceRefundView(
            await this.loadRefund(tx, actor, refund.id),
          ),
        };
      },
      replay: async (tx, refundId) =>
        toFinanceRefundView(await this.loadRefund(tx, actor, refundId)),
    });
  }

  async approve(
    actor: FinanceRefundActor,
    refundId: string,
    idempotencyKey: string,
    input: FinanceRefundDecisionInput,
  ) {
    await this.financeAccess.assertStaffAction(actor, "REFUND");
    const existing = await withTenantRlsContext(
      actor.tenantId,
      actor.orgId,
      (tx) => this.loadRefund(tx, actor, refundId),
    );
    await this.financeAccess.authorizeIndependentFinanceApproval(
      actor,
      existing.requestedByUserId,
      actor.userId,
      "REFUND",
    );
    const commandActor: FinanceCommandActor = actor;
    const approved = await this.commands.execute({
      actor: commandActor,
      idempotencyKey,
      commandType: "APPROVE_REFUND",
      resourceType: "REFUND",
      request: { refundId, reason: input.reason.trim() },
      perform: async (tx) => {
        let refund = await this.loadRefund(tx, actor, refundId);
        await lockReceipt(tx, actor, refund.receiptId);
        await lockFinanceRefund(tx, actor, refundId);
        refund = await this.loadRefund(tx, actor, refundId);
        if (refund.status === "PENDING") {
          await tx.financeRefund.updateMany({
            where: {
              id: refundId,
              tenantId: actor.tenantId,
              orgId: actor.orgId,
              status: "PENDING",
            },
            data: {
              status: "APPROVED",
              approvedByUserId: actor.userId,
              approvedAt: new Date(),
              decisionReason: input.reason.trim(),
            },
          });
          await tx.financeRefundEvent.create({
            data: {
              refundId,
              tenantId: actor.tenantId,
              orgId: actor.orgId,
              actorUserId: actor.userId,
              type: "APPROVED",
              reason: input.reason.trim(),
            },
          });
        } else if (!isRetryableApprovedRefund(refund.status)) {
          throw new ConflictException("Finance refund is no longer approvable");
        }
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

    if (approved.source === "STRIPE_CARD") {
      return this.stripeRefundSubmission.submit(actor, refundId);
    }
    return approved;
  }

  async reject(
    actor: FinanceRefundActor,
    refundId: string,
    idempotencyKey: string,
    input: FinanceRefundDecisionInput,
  ) {
    await this.financeAccess.assertStaffAction(actor, "REFUND");
    const existing = await withTenantRlsContext(
      actor.tenantId,
      actor.orgId,
      (tx) => this.loadRefund(tx, actor, refundId),
    );
    await this.financeAccess.authorizeIndependentFinanceApproval(
      actor,
      existing.requestedByUserId,
      actor.userId,
      "REFUND",
    );
    const commandActor: FinanceCommandActor = actor;
    return this.commands.execute({
      actor: commandActor,
      idempotencyKey,
      commandType: "REJECT_REFUND",
      resourceType: "REFUND",
      request: { refundId, reason: input.reason.trim() },
      perform: async (tx) => {
        let refund = await this.loadRefund(tx, actor, refundId);
        if (refund.status !== "PENDING") {
          throw new ConflictException("Only pending refunds can be rejected");
        }
        await lockReceipt(tx, actor, refund.receiptId);
        await lockFinanceRefund(tx, actor, refundId);
        refund = await this.loadRefund(tx, actor, refundId);
        if (refund.status !== "PENDING") {
          throw new ConflictException("Only pending refunds can be rejected");
        }
        await tx.financeRefund.updateMany({
          where: {
            id: refundId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            status: "PENDING",
          },
          data: {
            status: "REJECTED",
            decisionReason: input.reason.trim(),
          },
        });
        await tx.financeRefundEvent.create({
          data: {
            refundId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            actorUserId: actor.userId,
            type: "REJECTED",
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

  async confirmManualRefund(
    actor: FinanceRefundActor,
    refundId: string,
    idempotencyKey: string,
    input: FinanceManualRefundConfirmationInput,
  ) {
    await this.financeAccess.assertStaffAction(actor, "REFUND");
    const bankTransactionReference = input.bankTransactionReference.trim();
    if (!bankTransactionReference) {
      throw new BadRequestException("Bank reference is required");
    }
    const commandActor: FinanceCommandActor = actor;
    return this.commands.execute({
      actor: commandActor,
      idempotencyKey,
      commandType: "CONFIRM_MANUAL_REFUND",
      resourceType: "REFUND",
      request: { refundId, bankTransactionReference },
      perform: async (tx) => {
        let refund = await this.loadRefund(tx, actor, refundId);
        await lockReceipt(tx, actor, refund.receiptId);
        await lockFinanceRefund(tx, actor, refundId);
        refund = await this.loadRefund(tx, actor, refundId);
        if (
          refund.source !== "MANUAL_TRANSFER" ||
          refund.status !== "APPROVED"
        ) {
          throw new ConflictException(
            "Only approved manual transfer refunds can be confirmed",
          );
        }
        const duplicateReference = await tx.financeRefund.findFirst({
          where: {
            financeProfileId: refund.financeProfileId,
            bankTransactionReference,
            id: { not: refundId },
          },
          select: { id: true },
        });
        if (duplicateReference) {
          throw new ConflictException(
            "Bank reference is already recorded for another refund",
          );
        }

        const confirmedAt = new Date();
        await tx.financeRefund.updateMany({
          where: {
            id: refundId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            status: "APPROVED",
          },
          data: {
            status: "CONFIRMED",
            bankTransactionReference,
            confirmedAt,
          },
        });
        await recordFinanceReceiptMovement(tx, {
          financeProfileId: refund.financeProfileId,
          receiptId: refund.receiptId,
          refundId,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          type: "REFUND",
          source: "MANUAL_TRANSFER",
          amountMinor: refund.amountMinor,
          currency: refund.currency,
          sourceReference: refundId,
          occurredAt: confirmedAt,
          recordedByUserId: actor.userId,
        });
        await tx.financeRefundEvent.create({
          data: {
            refundId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            actorUserId: actor.userId,
            type: "CONFIRMED",
            reason: `Bank reference ${bankTransactionReference}`,
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

  private async findStripeReceiptFacts(
    tx: Prisma.TransactionClient,
    actor: FinanceRefundActor,
    receipt: {
      sourceReference: string | null;
    },
  ) {
    if (!receipt.sourceReference) {
      throw new ConflictException(
        "Stripe refund is missing its Checkout evidence",
      );
    }
    const attempt = await tx.financeCheckoutAttempt.findFirst({
      where: {
        stripeCheckoutSessionId: receipt.sourceReference,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        status: "PAID",
      },
      select: { stripeAccountId: true, stripePaymentIntentId: true },
    });
    if (!attempt?.stripePaymentIntentId) {
      throw new ConflictException(
        "Stripe refund requires a confirmed PaymentIntent",
      );
    }
    return { stripeAccountId: attempt.stripeAccountId };
  }

  private async loadRefund(
    tx: Prisma.TransactionClient,
    actor: FinanceRefundActor,
    refundId: string,
  ) {
    return loadFinanceRefund(tx, actor, refundId);
  }
}

function refundSourceForReceipt(
  source: "MANUAL_TRANSFER" | "STRIPE_CARD" | "STRIPE_BACS",
): "MANUAL_TRANSFER" | "STRIPE_CARD" {
  if (source === "MANUAL_TRANSFER") return source;
  if (source === "STRIPE_CARD") return source;
  throw new ConflictException("Bacs refunds are not enabled for Finance yet");
}

function isRetryableApprovedRefund(
  status: string,
): status is "APPROVED" | "SUBMITTED" {
  return status === "APPROVED" || status === "SUBMITTED";
}
