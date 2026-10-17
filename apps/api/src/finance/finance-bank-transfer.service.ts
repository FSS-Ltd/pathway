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
  FinanceBankTransferChangeInput,
  FinanceBankTransferChangeListQuery,
  FinanceBankTransferDecisionInput,
} from "./dto/finance-bank-transfer.dto";
import { FinanceBalanceService } from "./finance-balance.service";
import { FinanceCommandService } from "./finance-command.service";
import { lockInvoice } from "./finance-invoice-operations";
import { lockBankTransferChange } from "./finance-manual-transfer-operations";
import {
  financeBankTransferChangeSelect,
  toFinanceBankTransferChangeView,
  type FinanceBankTransferChangeRecord,
} from "./finance-manual-transfer-records";

export interface FinanceBankTransferActor extends FinanceAccessScope {
  userId: string;
}

@Injectable()
export class FinanceBankTransferService {
  constructor(
    @Inject(FinanceAccessService)
    private readonly financeAccess: FinanceAccessService,
    @Inject(FinanceCommandService)
    private readonly commands: FinanceCommandService,
    @Inject(FinanceBalanceService)
    private readonly balances: FinanceBalanceService,
  ) {}

  async listChanges(
    actor: FinanceBankTransferActor,
    query: FinanceBankTransferChangeListQuery,
  ) {
    await this.financeAccess.assertStaffAction(actor, "READ_RECORDS");
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const changes = await tx.financeBankTransferChange.findMany({
        where: {
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          status: query.status,
        },
        select: financeBankTransferChangeSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: query.limit,
      });
      return { items: changes.map(toFinanceBankTransferChangeView) };
    });
  }

  async requestChange(
    actor: FinanceBankTransferActor,
    idempotencyKey: string,
    input: FinanceBankTransferChangeInput,
  ) {
    await this.financeAccess.assertStaffAction(
      actor,
      "MANAGE_BANK_TRANSFER_DETAILS",
    );
    const normalized = {
      accountHolderName: input.accountHolderName.trim(),
      sortCode: input.sortCode.replaceAll("-", ""),
      accountNumber: input.accountNumber.trim(),
      reason: input.reason.trim(),
    };

    try {
      return await withTenantRlsContext(
        actor.tenantId,
        actor.orgId,
        async (tx) => {
          await this.financeAccess.assertStaffAction(
            actor,
            "MANAGE_BANK_TRANSFER_DETAILS",
          );
          const profile = await tx.financeProfile.findUnique({
            where: {
              tenantId_orgId: {
                tenantId: actor.tenantId,
                orgId: actor.orgId,
              },
            },
            select: { id: true },
          });
          if (!profile) {
            throw new NotFoundException("Finance profile not found");
          }

          const existing = await tx.financeBankTransferChange.findUnique({
            where: {
              tenantId_orgId_requestedByUserId_idempotencyKey: {
                tenantId: actor.tenantId,
                orgId: actor.orgId,
                requestedByUserId: actor.userId,
                idempotencyKey,
              },
            },
            select: financeBankTransferChangeSelect,
          });
          if (existing) return this.replayChange(existing, normalized);

          const current = await this.currentApprovedChange(
            tx,
            actor,
            profile.id,
          );
          if (
            current &&
            current.accountHolderName === normalized.accountHolderName &&
            current.sortCode === normalized.sortCode &&
            current.accountNumber === normalized.accountNumber
          ) {
            throw new ConflictException(
              "The approved bank transfer details are already current",
            );
          }

          const pending = await tx.financeBankTransferChange.findFirst({
            where: {
              financeProfileId: profile.id,
              tenantId: actor.tenantId,
              orgId: actor.orgId,
              status: "PENDING",
            },
            select: { id: true },
          });
          if (pending) {
            throw new ConflictException(
              "A bank transfer destination change is already awaiting approval",
            );
          }

          const change = await tx.financeBankTransferChange.create({
            data: {
              financeProfileId: profile.id,
              tenantId: actor.tenantId,
              orgId: actor.orgId,
              requestedByUserId: actor.userId,
              idempotencyKey,
              ...normalized,
            },
            select: financeBankTransferChangeSelect,
          });
          return toFinanceBankTransferChangeView(change);
        },
      );
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const existing = await this.findByIdempotencyKey(actor, idempotencyKey);
      if (existing) return this.replayChange(existing, normalized);
      throw new ConflictException(
        "A bank transfer destination change is already awaiting approval",
      );
    }
  }

  async approveChange(
    actor: FinanceBankTransferActor,
    changeId: string,
    idempotencyKey: string,
  ) {
    return this.decideChange(actor, changeId, idempotencyKey, "APPROVED");
  }

  async rejectChange(
    actor: FinanceBankTransferActor,
    changeId: string,
    idempotencyKey: string,
    input: FinanceBankTransferDecisionInput,
  ) {
    return this.decideChange(
      actor,
      changeId,
      idempotencyKey,
      "REJECTED",
      input.reason.trim(),
    );
  }

  async forPayerInvoice(
    actor: FinanceBankTransferActor,
    payerAccountId: string,
    invoiceId: string,
  ) {
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await this.financeAccess.assertPayerAction(
        actor,
        actor.userId,
        payerAccountId,
        "SETTLE_ISSUED_INVOICE",
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
          invoiceNumber: true,
          status: true,
          totalMinor: true,
        },
      });
      if (!invoice || !invoice.invoiceNumber) {
        throw new NotFoundException("Finance invoice not found");
      }
      const balance = await this.balances.forInvoices(tx, actor, [invoice]);
      if (balance.get(invoice.id)?.outstandingMinor === "0") {
        throw new ConflictException("This invoice has no amount due");
      }
      const destination = await this.currentApprovedChange(
        tx,
        actor,
        invoice.financeProfileId,
      );
      if (!destination) {
        throw new NotFoundException("Bank transfer details are unavailable");
      }
      return {
        accountHolderName: destination.accountHolderName,
        sortCode: destination.sortCode,
        accountNumber: destination.accountNumber,
        reference: invoice.invoiceNumber.toString(),
      };
    });
  }

  private async decideChange(
    actor: FinanceBankTransferActor,
    changeId: string,
    idempotencyKey: string,
    status: "APPROVED" | "REJECTED",
    decisionReason?: string,
  ) {
    return this.commands.execute({
      actor,
      idempotencyKey,
      commandType:
        status === "APPROVED"
          ? "APPROVE_BANK_TRANSFER_CHANGE"
          : "REJECT_BANK_TRANSFER_CHANGE",
      resourceType: "BANK_TRANSFER_CHANGE",
      request: { changeId, status, decisionReason: decisionReason ?? null },
      perform: async (tx) => {
        await lockBankTransferChange(tx, actor, changeId);
        const change = await tx.financeBankTransferChange.findFirst({
          where: {
            id: changeId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
          },
          select: financeBankTransferChangeSelect,
        });
        if (!change) {
          throw new NotFoundException("Bank transfer change not found");
        }
        if (change.status !== "PENDING") {
          throw new ConflictException(
            "Bank transfer change is no longer awaiting approval",
          );
        }
        if (status === "REJECTED" && !decisionReason) {
          throw new BadRequestException("A rejection reason is required");
        }
        await this.financeAccess.authorizeIndependentFinanceApproval(
          actor,
          change.requestedByUserId,
          actor.userId,
          "MANAGE_BANK_TRANSFER_DETAILS",
        );
        const decided = await tx.financeBankTransferChange.update({
          where: { id: change.id },
          data: {
            status,
            decidedByUserId: actor.userId,
            decisionReason: decisionReason ?? null,
            decidedAt: new Date(),
          },
          select: financeBankTransferChangeSelect,
        });
        return {
          resourceId: decided.id,
          value: toFinanceBankTransferChangeView(decided),
        };
      },
      replay: async (tx, resourceId) => {
        const change = await tx.financeBankTransferChange.findFirst({
          where: {
            id: resourceId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
          },
          select: financeBankTransferChangeSelect,
        });
        if (!change) {
          throw new NotFoundException("Bank transfer change not found");
        }
        return toFinanceBankTransferChangeView(change);
      },
    });
  }

  private async currentApprovedChange(
    tx: Prisma.TransactionClient,
    actor: FinanceAccessScope,
    financeProfileId: string,
  ): Promise<FinanceBankTransferChangeRecord | null> {
    return tx.financeBankTransferChange.findFirst({
      where: {
        financeProfileId,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        status: "APPROVED",
      },
      select: financeBankTransferChangeSelect,
      orderBy: [{ decidedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    });
  }

  private async findByIdempotencyKey(
    actor: FinanceBankTransferActor,
    idempotencyKey: string,
  ): Promise<FinanceBankTransferChangeRecord | null> {
    return withTenantRlsContext(actor.tenantId, actor.orgId, (tx) =>
      tx.financeBankTransferChange.findUnique({
        where: {
          tenantId_orgId_requestedByUserId_idempotencyKey: {
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            requestedByUserId: actor.userId,
            idempotencyKey,
          },
        },
        select: financeBankTransferChangeSelect,
      }),
    );
  }

  private replayChange(
    existing: FinanceBankTransferChangeRecord,
    requested: Pick<
      FinanceBankTransferChangeInput,
      "accountHolderName" | "sortCode" | "accountNumber" | "reason"
    >,
  ) {
    if (
      existing.accountHolderName !== requested.accountHolderName ||
      existing.sortCode !== requested.sortCode ||
      existing.accountNumber !== requested.accountNumber ||
      existing.reason !== requested.reason
    ) {
      throw new ConflictException(
        "Idempotency-Key was already used for different bank transfer details",
      );
    }
    return toFinanceBankTransferChangeView(existing);
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
