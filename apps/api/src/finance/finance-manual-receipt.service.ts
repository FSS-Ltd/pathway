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
import type {
  FinanceManualReceiptDecisionInput,
  FinanceManualReceiptRequestInput,
  FinanceManualReceiptRequestListQuery,
  FinanceTransferNoticeInput,
  FinanceTransferNoticeListQuery,
} from "./dto/finance-manual-receipt.dto";
import { parsePositiveAmount } from "./finance-receipt-operations";
import { FinanceBalanceService } from "./finance-balance.service";
import { FinanceCommandService } from "./finance-command.service";
import { lockInvoice } from "./finance-invoice-operations";
import { lockManualReceiptRequest } from "./finance-manual-transfer-operations";
import {
  financeManualReceiptRequestInclude,
  financeTransferNoticeInclude,
  toFinanceManualReceiptRequestView,
  toFinanceTransferNoticeView,
} from "./finance-manual-transfer-records";

export interface FinanceManualTransferActor extends FinanceAccessScope {
  userId: string;
}

@Injectable()
export class FinanceManualReceiptService {
  constructor(
    @Inject(FinanceAccessService)
    private readonly financeAccess: FinanceAccessService,
    @Inject(FinanceCommandService)
    private readonly commands: FinanceCommandService,
    @Inject(FinanceBalanceService)
    private readonly balances: FinanceBalanceService,
  ) {}

  async createRequest(
    actor: FinanceManualTransferActor,
    idempotencyKey: string,
    input: FinanceManualReceiptRequestInput,
  ) {
    await this.financeAccess.assertStaffAction(
      actor,
      "RECORD_IN_FLIGHT_PAYMENT",
    );
    const amountMinor = parsePositiveAmount(input.amountMinor);
    const receivedAt = new Date(input.receivedAt);
    assertNotFuture(receivedAt, "Receipt date");
    const reason = input.reason.trim();
    const reference = input.bankTransactionReference.trim();
    return this.commands.execute({
      actor,
      idempotencyKey,
      commandType: "CREATE_MANUAL_RECEIPT_REQUEST",
      resourceType: "MANUAL_RECEIPT_REQUEST",
      request: {
        payerAccountId: input.payerAccountId,
        transferNoticeId: input.transferNoticeId ?? null,
        bankTransactionReference: reference,
        amountMinor: input.amountMinor,
        receivedAt: receivedAt.toISOString(),
        reason,
      },
      perform: async (tx) => {
        await this.financeAccess.assertStaffAction(
          actor,
          "RECORD_IN_FLIGHT_PAYMENT",
        );
        const payerAccount = await tx.financePayerAccount.findFirst({
          where: {
            id: input.payerAccountId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
          },
          select: { id: true, financeProfileId: true },
        });
        if (!payerAccount) {
          throw new NotFoundException("Finance payer account not found");
        }

        if (input.transferNoticeId) {
          const notice = await tx.financeTransferNotice.findFirst({
            where: {
              id: input.transferNoticeId,
              tenantId: actor.tenantId,
              orgId: actor.orgId,
              payerAccountId: payerAccount.id,
            },
            select: { id: true },
          });
          if (!notice) {
            throw new NotFoundException("Finance transfer notice not found");
          }
          const linkedRequest = await tx.financeManualReceiptRequest.findFirst({
            where: {
              transferNoticeId: notice.id,
              tenantId: actor.tenantId,
              orgId: actor.orgId,
            },
            select: { id: true },
          });
          if (linkedRequest) {
            throw new ConflictException(
              "This transfer notice already has a manual receipt review",
            );
          }
        }

        let request: { id: string };
        try {
          request = await tx.financeManualReceiptRequest.create({
            data: {
              financeProfileId: payerAccount.financeProfileId,
              payerAccountId: payerAccount.id,
              transferNoticeId: input.transferNoticeId,
              tenantId: actor.tenantId,
              orgId: actor.orgId,
              requestedByUserId: actor.userId,
              bankTransactionReference: reference,
              amountMinor,
              receivedAt,
              requestReason: reason,
            },
            select: { id: true },
          });
        } catch (error) {
          if (!isUniqueConstraintError(error)) throw error;
          throw new ConflictException(
            "This bank transaction reference or transfer notice already has a manual receipt review",
          );
        }
        return {
          resourceId: request.id,
          value: await this.loadRequestView(tx, actor, request.id),
        };
      },
      replay: (tx, requestId) => this.loadRequestView(tx, actor, requestId),
    });
  }

  async listRequests(
    actor: FinanceManualTransferActor,
    query: FinanceManualReceiptRequestListQuery,
  ) {
    await this.financeAccess.assertStaffAction(actor, "READ_RECORDS");
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const requests = await tx.financeManualReceiptRequest.findMany({
        where: {
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          status: query.status,
        },
        include: financeManualReceiptRequestInclude,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: query.limit,
      });
      return { items: requests.map(toFinanceManualReceiptRequestView) };
    });
  }

  async approveRequest(
    actor: FinanceManualTransferActor,
    requestId: string,
    idempotencyKey: string,
  ) {
    return this.decideRequest(actor, requestId, idempotencyKey, "APPROVED");
  }

  async rejectRequest(
    actor: FinanceManualTransferActor,
    requestId: string,
    idempotencyKey: string,
    input: FinanceManualReceiptDecisionInput,
  ) {
    return this.decideRequest(
      actor,
      requestId,
      idempotencyKey,
      "REJECTED",
      input.reason.trim(),
    );
  }

  async submitTransferNotice(
    actor: FinanceManualTransferActor,
    payerAccountId: string,
    invoiceId: string,
    idempotencyKey: string,
    input: FinanceTransferNoticeInput,
  ) {
    await this.financeAccess.assertPayerAction(
      actor,
      actor.userId,
      payerAccountId,
      "DECLARE_TRANSFER",
    );
    const amountMinor = parsePositiveAmount(input.amountMinor);
    const declaredTransferredAt = new Date(input.declaredTransferredAt);
    assertNotFuture(declaredTransferredAt, "Transfer date");

    return this.commands.execute({
      actor,
      idempotencyKey,
      commandType: "SUBMIT_TRANSFER_NOTICE",
      resourceType: "TRANSFER_NOTICE",
      request: {
        payerAccountId,
        invoiceId,
        amountMinor: input.amountMinor,
        declaredTransferredAt: declaredTransferredAt.toISOString(),
      },
      perform: async (tx) => {
        await this.financeAccess.assertPayerAction(
          actor,
          actor.userId,
          payerAccountId,
          "DECLARE_TRANSFER",
        );
        await lockInvoice(tx, actor, invoiceId);
        const invoice = await tx.financeInvoice.findFirst({
          where: {
            id: invoiceId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            payerAccountId,
            status: "ISSUED",
          },
          select: {
            id: true,
            financeProfileId: true,
            payerAccountId: true,
            invoiceNumber: true,
            status: true,
            totalMinor: true,
          },
        });
        if (!invoice || !invoice.invoiceNumber || !invoice.payerAccountId) {
          throw new NotFoundException("Issued Finance invoice not found");
        }
        const balance = await this.balances.forInvoices(tx, actor, [invoice]);
        if (balance.get(invoice.id)?.outstandingMinor === "0") {
          throw new ConflictException("This invoice has no amount due");
        }
        const notice = await tx.financeTransferNotice.create({
          data: {
            financeProfileId: invoice.financeProfileId,
            payerAccountId: invoice.payerAccountId,
            invoiceId: invoice.id,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            payerUserId: actor.userId,
            idempotencyKey,
            invoiceNumber: invoice.invoiceNumber,
            amountMinor,
            declaredTransferredAt,
          },
          select: { id: true },
        });
        return {
          resourceId: notice.id,
          value: await this.loadNoticeView(tx, actor, notice.id),
        };
      },
      replay: (tx, noticeId) => this.loadNoticeView(tx, actor, noticeId),
    });
  }

  async listTransferNotices(
    actor: FinanceManualTransferActor,
    query: FinanceTransferNoticeListQuery,
  ) {
    await this.financeAccess.assertStaffAction(actor, "READ_RECORDS");
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const notices = await tx.financeTransferNotice.findMany({
        where: { tenantId: actor.tenantId, orgId: actor.orgId },
        include: financeTransferNoticeInclude,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: query.limit,
      });
      return { items: notices.map(toFinanceTransferNoticeView) };
    });
  }

  private async decideRequest(
    actor: FinanceManualTransferActor,
    requestId: string,
    idempotencyKey: string,
    status: "APPROVED" | "REJECTED",
    decisionReason?: string,
  ) {
    return this.commands.execute({
      actor,
      idempotencyKey,
      commandType:
        status === "APPROVED"
          ? "APPROVE_MANUAL_RECEIPT_REQUEST"
          : "REJECT_MANUAL_RECEIPT_REQUEST",
      resourceType: "MANUAL_RECEIPT_REQUEST",
      request: { requestId, status, decisionReason: decisionReason ?? null },
      perform: async (tx) => {
        await lockManualReceiptRequest(tx, actor, requestId);
        const request = await tx.financeManualReceiptRequest.findFirst({
          where: {
            id: requestId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
          },
          select: {
            id: true,
            financeProfileId: true,
            payerAccountId: true,
            bankTransactionReference: true,
            amountMinor: true,
            currency: true,
            requestedByUserId: true,
            status: true,
          },
        });
        if (!request) {
          throw new NotFoundException("Manual receipt request not found");
        }
        if (request.status !== "PENDING") {
          throw new ConflictException(
            "Manual receipt request is no longer awaiting approval",
          );
        }
        if (status === "REJECTED" && !decisionReason) {
          throw new BadRequestException("A rejection reason is required");
        }
        await this.financeAccess.authorizeIndependentFinanceApproval(
          actor,
          request.requestedByUserId,
          actor.userId,
          "RECORD_IN_FLIGHT_PAYMENT",
        );

        let receiptId: string | null = null;
        if (status === "APPROVED") {
          const receipt = await tx.financeReceipt.create({
            data: {
              financeProfileId: request.financeProfileId,
              payerAccountId: request.payerAccountId,
              tenantId: actor.tenantId,
              orgId: actor.orgId,
              amountMinor: request.amountMinor,
              currency: request.currency,
              source: "MANUAL_TRANSFER",
              sourceReference: request.bankTransactionReference,
              status: "PROCESSING",
            },
            select: { id: true },
          });
          await tx.financeReceipt.update({
            where: { id: receipt.id },
            data: { status: "CONFIRMED", confirmedAt: new Date() },
          });
          receiptId = receipt.id;
        }

        await tx.financeManualReceiptRequest.update({
          where: { id: request.id },
          data: {
            status,
            receiptId,
            decidedByUserId: actor.userId,
            decisionReason: decisionReason ?? null,
            decidedAt: new Date(),
          },
        });
        return {
          resourceId: request.id,
          value: await this.loadRequestView(tx, actor, request.id),
        };
      },
      replay: (tx, resourceId) => this.loadRequestView(tx, actor, resourceId),
    });
  }

  private async loadRequestView(
    tx: Prisma.TransactionClient,
    actor: FinanceAccessScope,
    requestId: string,
  ) {
    const request = await tx.financeManualReceiptRequest.findFirst({
      where: {
        id: requestId,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
      },
      include: financeManualReceiptRequestInclude,
    });
    if (!request) {
      throw new NotFoundException("Manual receipt request not found");
    }
    return toFinanceManualReceiptRequestView(request);
  }

  private async loadNoticeView(
    tx: Prisma.TransactionClient,
    actor: FinanceAccessScope,
    noticeId: string,
  ) {
    const notice = await tx.financeTransferNotice.findFirst({
      where: {
        id: noticeId,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
      },
      include: financeTransferNoticeInclude,
    });
    if (!notice) {
      throw new NotFoundException("Finance transfer notice not found");
    }
    return toFinanceTransferNoticeView(notice);
  }
}

function assertNotFuture(value: Date, label: string): void {
  if (Number.isNaN(value.getTime())) {
    throw new BadRequestException(`${label} is invalid`);
  }
  if (value.getTime() > Date.now()) {
    throw new BadRequestException(`${label} cannot be in the future`);
  }
}

function isUniqueConstraintError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}
