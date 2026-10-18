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
  FinanceReceiptAllocationInput,
  FinanceReceiptListQuery,
  FinanceReceiptReversalInput,
} from "./dto/finance-receipt.dto";
import { addMinorUnits } from "./domain/minor-units";
import { FinanceBalanceService } from "./finance-balance.service";
import {
  FinanceCommandService,
  type FinanceCommandActor,
} from "./finance-command.service";
import { lockInvoice } from "./finance-invoice-operations";
import {
  lockAllocation,
  lockReceipt,
  parsePositiveAmount,
} from "./finance-receipt-operations";
import {
  confirmedReceiptUnapplied,
  financeAllocationInclude,
  financeReceiptInclude,
  toFinanceAllocationView,
  toFinanceReceiptView,
  toFinanceReversalView,
  type FinanceReceiptRecord,
} from "./finance-receipt-records";

export interface FinanceReceiptActor extends FinanceAccessScope {
  userId: string;
}

@Injectable()
export class FinanceReceiptService {
  constructor(
    @Inject(FinanceAccessService)
    private readonly financeAccess: FinanceAccessService,
    @Inject(FinanceCommandService)
    private readonly commands: FinanceCommandService,
    @Inject(FinanceBalanceService)
    private readonly balances: FinanceBalanceService,
  ) {}

  async list(actor: FinanceReceiptActor, query: FinanceReceiptListQuery) {
    await this.financeAccess.assertStaffAction(actor, "READ_RECORDS");
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const receipts = await tx.financeReceipt.findMany({
        where: {
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          status: query.status,
        },
        include: financeReceiptInclude,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: query.limit,
      });
      return { items: receipts.map(toFinanceReceiptView) };
    });
  }

  async get(actor: FinanceReceiptActor, receiptId: string) {
    await this.financeAccess.assertStaffAction(actor, "READ_RECORDS");
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const receipt = await this.requireReceipt(tx, actor, receiptId);
      return toFinanceReceiptView(receipt);
    });
  }

  async allocate(
    actor: FinanceReceiptActor,
    receiptId: string,
    idempotencyKey: string,
    input: FinanceReceiptAllocationInput,
  ) {
    await this.financeAccess.assertStaffAction(actor, "ALLOCATE_RECEIPT");
    const amountMinor = parsePositiveAmount(input.amountMinor);
    const commandActor: FinanceCommandActor = actor;
    return this.commands.execute({
      actor: commandActor,
      idempotencyKey,
      commandType: "ALLOCATE_RECEIPT",
      resourceType: "ALLOCATION",
      request: {
        receiptId,
        invoiceId: input.invoiceId,
        amountMinor: input.amountMinor,
      },
      perform: async (tx) => {
        await lockReceipt(tx, actor, receiptId);
        await lockInvoice(tx, actor, input.invoiceId);
        const receipt = await this.requireReceipt(tx, actor, receiptId);
        const invoice = await tx.financeInvoice.findFirst({
          where: {
            id: input.invoiceId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
          },
          select: {
            id: true,
            financeProfileId: true,
            payerAccountId: true,
            currency: true,
            status: true,
            totalMinor: true,
          },
        });
        if (!invoice) throw new NotFoundException("Finance invoice not found");
        if (receipt.status !== "CONFIRMED") {
          throw new ConflictException(
            "Only confirmed receipts can be allocated",
          );
        }
        if (invoice.status !== "ISSUED") {
          throw new ConflictException(
            "Receipts can only be allocated to issued invoices",
          );
        }
        if (
          receipt.financeProfileId !== invoice.financeProfileId ||
          !receipt.payerAccountId ||
          receipt.payerAccountId !== invoice.payerAccountId
        ) {
          throw new ConflictException(
            "Receipt and invoice must belong to the same payer account",
          );
        }
        if (receipt.currency !== invoice.currency) {
          throw new ConflictException(
            "Receipt and invoice currencies must match",
          );
        }

        const receiptUnapplied = confirmedReceiptUnapplied(receipt);
        const invoiceBalances = await this.balances.forInvoices(tx, actor, [
          invoice,
        ]);
        const invoiceBalance = invoiceBalances.get(invoice.id);
        if (!invoiceBalance) {
          throw new Error("Finance invoice balance projection is unavailable");
        }
        const activeCheckoutAttempts = await tx.financeCheckoutAttempt.findMany(
          {
            where: {
              invoiceId: invoice.id,
              tenantId: actor.tenantId,
              orgId: actor.orgId,
              status: { in: ["CREATING", "OPEN", "COMPLETED"] },
            },
            select: { amountMinor: true },
          },
        );
        const checkoutReserved = activeCheckoutAttempts.reduce(
          (sum, attempt) => sum + attempt.amountMinor,
          0n,
        );
        const allocatableMinor =
          BigInt(invoiceBalance.outstandingMinor) > checkoutReserved
            ? BigInt(invoiceBalance.outstandingMinor) - checkoutReserved
            : 0n;
        if (amountMinor > receiptUnapplied || amountMinor > allocatableMinor) {
          throw new ConflictException(
            "Allocation exceeds the receipt funds or amount available after pending card payments",
          );
        }

        const allocation = await tx.financeReceiptAllocation.create({
          data: {
            receiptId,
            invoiceId: invoice.id,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            amountMinor,
            createdByUserId: actor.userId,
          },
          select: { id: true },
        });
        return {
          resourceId: allocation.id,
          value: await this.loadAllocationView(tx, actor, allocation.id),
        };
      },
      replay: (tx, allocationId) =>
        this.loadAllocationView(tx, actor, allocationId),
    });
  }

  async reverseAllocation(
    actor: FinanceReceiptActor,
    allocationId: string,
    idempotencyKey: string,
    input: FinanceReceiptReversalInput,
  ) {
    await this.financeAccess.assertStaffAction(actor, "REVERSE_RECEIPT");
    const amountMinor = parsePositiveAmount(input.amountMinor);
    const reason = input.reason.trim();
    if (!reason) throw new BadRequestException("Reversal reason is required");
    const commandActor: FinanceCommandActor = actor;
    return this.commands.execute({
      actor: commandActor,
      idempotencyKey,
      commandType: "REVERSE_ALLOCATION",
      resourceType: "ALLOCATION",
      request: { allocationId, amountMinor: input.amountMinor, reason },
      perform: async (tx) => {
        const identity = await tx.financeReceiptAllocation.findFirst({
          where: {
            id: allocationId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
          },
          select: { receiptId: true, invoiceId: true },
        });
        if (!identity) {
          throw new NotFoundException("Finance allocation not found");
        }
        await lockReceipt(tx, actor, identity.receiptId);
        await lockInvoice(tx, actor, identity.invoiceId);
        await lockAllocation(tx, actor, allocationId);
        const allocation = await tx.financeReceiptAllocation.findFirst({
          where: {
            id: allocationId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
          },
          include: financeAllocationInclude,
        });
        if (!allocation) {
          throw new NotFoundException("Finance allocation not found");
        }
        if (allocation.invoice.status !== "ISSUED") {
          throw new ConflictException(
            "Only allocations for issued invoices can be reversed",
          );
        }
        const reversedMinor = allocation.reversals.reduce(
          (sum, reversal) => addMinorUnits(sum, reversal.amountMinor),
          0n,
        );
        const remainingMinor = allocation.amountMinor - reversedMinor;
        if (amountMinor > remainingMinor) {
          throw new ConflictException(
            "Reversal exceeds the remaining allocated amount",
          );
        }

        const reversal = await tx.financeReceiptAllocationReversal.create({
          data: {
            allocationId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            actorUserId: actor.userId,
            amountMinor,
            reason,
          },
          select: { id: true },
        });
        return {
          resourceId: reversal.id,
          value: await this.loadReversalView(tx, actor, reversal.id),
        };
      },
      replay: (tx, reversalId) => this.loadReversalView(tx, actor, reversalId),
    });
  }

  private async requireReceipt(
    tx: Prisma.TransactionClient,
    actor: FinanceReceiptActor,
    receiptId: string,
  ): Promise<FinanceReceiptRecord> {
    const receipt = await tx.financeReceipt.findFirst({
      where: {
        id: receiptId,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
      },
      include: financeReceiptInclude,
    });
    if (!receipt) throw new NotFoundException("Finance receipt not found");
    return receipt;
  }

  private async loadAllocationView(
    tx: Prisma.TransactionClient,
    actor: FinanceReceiptActor,
    allocationId: string,
  ) {
    const allocation = await tx.financeReceiptAllocation.findFirst({
      where: {
        id: allocationId,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
      },
      include: financeAllocationInclude,
    });
    if (!allocation)
      throw new NotFoundException("Finance allocation not found");
    return toFinanceAllocationView(allocation);
  }

  private async loadReversalView(
    tx: Prisma.TransactionClient,
    actor: FinanceReceiptActor,
    reversalId: string,
  ) {
    const reversal = await tx.financeReceiptAllocationReversal.findFirst({
      where: {
        id: reversalId,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
      },
      select: {
        id: true,
        allocationId: true,
        amountMinor: true,
        reason: true,
        actorUserId: true,
        createdAt: true,
      },
    });
    if (!reversal) {
      throw new NotFoundException("Finance allocation reversal not found");
    }
    return {
      ...toFinanceReversalView(reversal),
      allocation: await this.loadAllocationView(
        tx,
        actor,
        reversal.allocationId,
      ),
    };
  }
}
