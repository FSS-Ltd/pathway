import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { FinanceAccessService } from "./access/finance-access.service";
import type { FinanceAccessScope } from "./access/finance-access.reader";
import { FinanceBalanceService } from "./finance-balance.service";
import type {
  FinanceInvoiceDraftInput,
  FinanceInvoiceListQuery,
  FinanceRequestChangesInput,
  FinanceVoidInvoiceInput,
} from "./dto/finance-invoice.dto";
import {
  FinanceCommandService,
  type FinanceCommandActor,
} from "./finance-command.service";
import {
  calculateInvoice,
  lockInvoice,
  nextInvoiceNumber,
  toDueDate,
} from "./finance-invoice-operations";
import {
  financeInvoiceInclude,
  toFinanceInvoiceView,
  type FinanceInvoiceRecord,
} from "./finance-records";

export interface FinanceInvoiceActor extends FinanceAccessScope {
  userId: string;
}
@Injectable()
export class FinanceInvoiceService {
  constructor(
    @Inject(FinanceAccessService)
    private readonly financeAccess: FinanceAccessService,
    @Inject(FinanceCommandService)
    private readonly commands: FinanceCommandService,
    @Inject(FinanceBalanceService)
    private readonly balances: FinanceBalanceService,
  ) {}

  async list(actor: FinanceInvoiceActor, query: FinanceInvoiceListQuery) {
    await this.financeAccess.assertStaffAction(actor, "READ_RECORDS");
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const rows = await tx.financeInvoice.findMany({
        where: {
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          status: query.status,
          payerAccountId: query.payerAccountId,
        },
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        include: financeInvoiceInclude,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: query.limit + 1,
      });
      const hasMore = rows.length > query.limit;
      const invoices = rows.slice(0, query.limit);
      const balances = await this.balances.forInvoices(tx, actor, invoices);
      return {
        nextCursor: hasMore ? (invoices.at(-1)?.id ?? null) : null,
        items: invoices.map((invoice) => {
          const balance = balances.get(invoice.id);
          if (!balance) {
            throw new Error("Finance invoice balance projection is missing");
          }
          return toFinanceInvoiceView(invoice, balance);
        }),
      };
    });
  }

  async get(actor: FinanceInvoiceActor, invoiceId: string) {
    await this.financeAccess.assertStaffAction(actor, "READ_RECORDS");
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const invoice = await this.requireInvoice(tx, actor, invoiceId);
      return this.toInvoiceView(tx, actor, invoice);
    });
  }

  async createDraft(
    actor: FinanceInvoiceActor,
    idempotencyKey: string,
    input: FinanceInvoiceDraftInput,
  ) {
    await this.financeAccess.assertStaffAction(actor, "CREATE_INVOICE");
    const commandActor: FinanceCommandActor = actor;
    return this.commands.execute({
      actor: commandActor,
      idempotencyKey,
      commandType: "CREATE_INVOICE",
      resourceType: "INVOICE",
      request: input,
      perform: async (tx) => {
        // Serialize the first Finance record against a concurrent change to
        // the school's country/currency profile.
        await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "FinanceProfile"
          WHERE "tenantId" = ${actor.tenantId}
            AND "orgId" = ${actor.orgId}
          FOR SHARE
        `;
        const profile = await tx.financeProfile.findUnique({
          where: {
            tenantId_orgId: {
              tenantId: actor.tenantId,
              orgId: actor.orgId,
            },
          },
          select: { id: true, currency: true },
        });
        if (!profile) throw new NotFoundException("Finance profile not found");
        const payerAccount = await tx.financePayerAccount.findFirst({
          where: {
            id: input.payerAccountId,
            financeProfileId: profile.id,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
          },
          select: { id: true },
        });
        if (!payerAccount) {
          throw new NotFoundException("Finance payer account not found");
        }

        const calculated = calculateInvoice(input.lines);
        const invoice = await tx.financeInvoice.create({
          data: {
            financeProfileId: profile.id,
            payerAccountId: payerAccount.id,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            currency: profile.currency,
            createdByUserId: actor.userId,
            dueAt: toDueDate(input.dueDate),
            subtotalMinor: calculated.totals.subtotalMinor,
            taxMinor: calculated.totals.taxMinor,
            totalMinor: calculated.totals.totalMinor,
            lines: {
              create: calculated.lines.map((line, lineOrder) => ({
                lineOrder,
                description: line.description,
                quantity: new Prisma.Decimal(line.quantity),
                unitAmountMinor: BigInt(line.unitAmountMinor),
                taxRateBasisPoints: line.taxRateBasisPoints,
                netAmountMinor: line.netAmountMinor,
                taxAmountMinor: line.taxAmountMinor,
                totalMinor: line.totalMinor,
              })),
            },
          },
          select: { id: true },
        });
        await this.recordEvent(tx, actor, invoice.id, "CREATED");
        const record = await this.requireInvoice(tx, actor, invoice.id);
        return {
          resourceId: invoice.id,
          value: await this.toInvoiceView(tx, actor, record),
        };
      },
      replay: (tx, invoiceId) => this.loadInvoiceView(tx, actor, invoiceId),
    });
  }

  async updateDraft(
    actor: FinanceInvoiceActor,
    invoiceId: string,
    idempotencyKey: string,
    input: FinanceInvoiceDraftInput,
  ) {
    await this.financeAccess.assertStaffAction(actor, "UPDATE_INVOICE");
    return this.commands.execute({
      actor,
      idempotencyKey,
      commandType: "UPDATE_INVOICE",
      resourceType: "INVOICE",
      request: { invoiceId, input },
      perform: async (tx) => {
        await lockInvoice(tx, actor, invoiceId);
        const invoice = await this.requireInvoice(tx, actor, invoiceId);
        if (invoice.status !== "DRAFT") {
          throw new ConflictException("Only draft invoices can be edited");
        }
        const payerAccount = await tx.financePayerAccount.findFirst({
          where: {
            id: input.payerAccountId,
            financeProfileId: invoice.financeProfileId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
          },
          select: { id: true },
        });
        if (!payerAccount) {
          throw new NotFoundException("Finance payer account not found");
        }
        const calculated = calculateInvoice(input.lines);
        await tx.financeInvoiceLine.deleteMany({ where: { invoiceId } });
        await tx.financeInvoiceLine.createMany({
          data: calculated.lines.map((line, lineOrder) => ({
            invoiceId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            lineOrder,
            description: line.description,
            quantity: new Prisma.Decimal(line.quantity),
            unitAmountMinor: BigInt(line.unitAmountMinor),
            taxRateBasisPoints: line.taxRateBasisPoints,
            netAmountMinor: line.netAmountMinor,
            taxAmountMinor: line.taxAmountMinor,
            totalMinor: line.totalMinor,
          })),
        });
        await tx.financeInvoice.update({
          where: { id: invoiceId },
          data: {
            payerAccountId: payerAccount.id,
            payerNameSnapshot: null,
            legalEntityNameSnapshot: null,
            dueAt: toDueDate(input.dueDate),
            subtotalMinor: calculated.totals.subtotalMinor,
            taxMinor: calculated.totals.taxMinor,
            totalMinor: calculated.totals.totalMinor,
          },
        });
        await this.recordEvent(tx, actor, invoiceId, "UPDATED");
        const record = await this.requireInvoice(tx, actor, invoiceId);
        return {
          resourceId: invoiceId,
          value: await this.toInvoiceView(tx, actor, record),
        };
      },
      replay: (tx, resourceId) => this.loadInvoiceView(tx, actor, resourceId),
    });
  }

  async submitForReview(
    actor: FinanceInvoiceActor,
    invoiceId: string,
    idempotencyKey: string,
  ) {
    await this.financeAccess.assertStaffAction(
      actor,
      "SUBMIT_INVOICE_FOR_REVIEW",
    );
    return this.commands.execute({
      actor,
      idempotencyKey,
      commandType: "SUBMIT_INVOICE_FOR_REVIEW",
      resourceType: "INVOICE",
      request: { invoiceId },
      perform: async (tx) => {
        await lockInvoice(tx, actor, invoiceId);
        const invoice = await this.requireInvoice(tx, actor, invoiceId);
        if (invoice.status !== "DRAFT") {
          throw new ConflictException("Only draft invoices can enter review");
        }
        if (
          !invoice.payerAccountId ||
          !invoice.dueAt ||
          invoice.lines.length === 0
        ) {
          throw new ConflictException(
            "Add a payer, due date and at least one line before review",
          );
        }
        await tx.financeInvoice.update({
          where: { id: invoiceId },
          data: { status: "IN_REVIEW" },
        });
        await this.recordEvent(tx, actor, invoiceId, "SUBMITTED_FOR_REVIEW");
        const record = await this.requireInvoice(tx, actor, invoiceId);
        return {
          resourceId: invoiceId,
          value: await this.toInvoiceView(tx, actor, record),
        };
      },
      replay: (tx, resourceId) => this.loadInvoiceView(tx, actor, resourceId),
    });
  }

  async approve(
    actor: FinanceInvoiceActor,
    invoiceId: string,
    idempotencyKey: string,
  ) {
    await this.financeAccess.assertStaffAction(actor, "REVIEW_INVOICE");
    return this.commands.execute({
      actor,
      idempotencyKey,
      commandType: "APPROVE_INVOICE",
      resourceType: "INVOICE",
      request: { invoiceId },
      perform: async (tx) => {
        await lockInvoice(tx, actor, invoiceId);
        const invoice = await this.requireInvoice(tx, actor, invoiceId);
        if (invoice.status !== "IN_REVIEW" || invoice.approvedAt) {
          throw new ConflictException("Invoice is not awaiting review");
        }
        if (!invoice.createdByUserId) {
          throw new ConflictException("Invoice creator evidence is missing");
        }
        await this.financeAccess.authorizeIndependentFinanceApproval(
          actor,
          invoice.createdByUserId,
          actor.userId,
        );
        await tx.financeInvoice.update({
          where: { id: invoiceId },
          data: { approvedAt: new Date(), approvedByUserId: actor.userId },
        });
        await this.recordEvent(tx, actor, invoiceId, "APPROVED");
        const record = await this.requireInvoice(tx, actor, invoiceId);
        return {
          resourceId: invoiceId,
          value: await this.toInvoiceView(tx, actor, record),
        };
      },
      replay: (tx, resourceId) => this.loadInvoiceView(tx, actor, resourceId),
    });
  }

  async requestChanges(
    actor: FinanceInvoiceActor,
    invoiceId: string,
    idempotencyKey: string,
    input: FinanceRequestChangesInput,
  ) {
    await this.financeAccess.assertStaffAction(actor, "REVIEW_INVOICE");
    return this.commands.execute({
      actor,
      idempotencyKey,
      commandType: "REQUEST_INVOICE_CHANGES",
      resourceType: "INVOICE",
      request: { invoiceId, ...input },
      perform: async (tx) => {
        await lockInvoice(tx, actor, invoiceId);
        const invoice = await this.requireInvoice(tx, actor, invoiceId);
        if (invoice.status !== "IN_REVIEW") {
          throw new ConflictException(
            "Only invoices in review can be returned",
          );
        }
        if (!invoice.createdByUserId) {
          throw new ConflictException("Invoice creator evidence is missing");
        }
        await this.financeAccess.authorizeIndependentFinanceApproval(
          actor,
          invoice.createdByUserId,
          actor.userId,
        );
        await tx.financeInvoice.update({
          where: { id: invoiceId },
          data: {
            status: "DRAFT",
            approvedAt: null,
            approvedByUserId: null,
          },
        });
        await this.recordEvent(
          tx,
          actor,
          invoiceId,
          "CHANGES_REQUESTED",
          input.reason,
        );
        const record = await this.requireInvoice(tx, actor, invoiceId);
        return {
          resourceId: invoiceId,
          value: await this.toInvoiceView(tx, actor, record),
        };
      },
      replay: (tx, resourceId) => this.loadInvoiceView(tx, actor, resourceId),
    });
  }

  async issue(
    actor: FinanceInvoiceActor,
    invoiceId: string,
    idempotencyKey: string,
  ) {
    await this.financeAccess.assertStaffAction(actor, "ISSUE_INVOICE");
    return this.commands.execute({
      actor,
      idempotencyKey,
      commandType: "ISSUE_INVOICE",
      resourceType: "INVOICE",
      request: { invoiceId },
      perform: async (tx) => {
        await lockInvoice(tx, actor, invoiceId);
        const invoice = await this.requireInvoice(tx, actor, invoiceId);
        if (
          invoice.status !== "IN_REVIEW" ||
          !invoice.approvedAt ||
          !invoice.approvedByUserId ||
          !invoice.createdByUserId
        ) {
          throw new ConflictException(
            "An invoice must be independently approved before issue",
          );
        }
        if (invoice.createdByUserId === invoice.approvedByUserId) {
          throw new ConflictException("Independent Finance approval required");
        }
        const approvalEvent = invoice.events.find(
          (event) =>
            event.type === "APPROVED" &&
            event.actorUserId === invoice.approvedByUserId,
        );
        if (!approvalEvent) {
          throw new ConflictException("Invoice approval evidence is missing");
        }
        const profile = await tx.financeProfile.findFirst({
          where: {
            id: invoice.financeProfileId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
          },
          select: { legalEntityName: true },
        });
        const payer = invoice.payerAccount;
        if (!profile || !payer) {
          throw new ConflictException(
            "Finance invoice snapshot data is missing",
          );
        }
        const invoiceNumber = await nextInvoiceNumber(
          tx,
          actor,
          invoice.financeProfileId,
        );
        await tx.financeInvoice.update({
          where: { id: invoiceId },
          data: {
            invoiceNumber,
            status: "ISSUED",
            issuedAt: new Date(),
            payerNameSnapshot: payer.displayName,
            legalEntityNameSnapshot: profile.legalEntityName,
          },
        });
        await this.recordEvent(tx, actor, invoiceId, "ISSUED");
        const record = await this.requireInvoice(tx, actor, invoiceId);
        return {
          resourceId: invoiceId,
          value: await this.toInvoiceView(tx, actor, record),
        };
      },
      replay: (tx, resourceId) => this.loadInvoiceView(tx, actor, resourceId),
    });
  }

  async void(
    actor: FinanceInvoiceActor,
    invoiceId: string,
    idempotencyKey: string,
    input: FinanceVoidInvoiceInput,
  ) {
    await this.financeAccess.assertStaffAction(actor, "VOID_INVOICE");
    return this.commands.execute({
      actor,
      idempotencyKey,
      commandType: "VOID_INVOICE",
      resourceType: "INVOICE",
      request: { invoiceId, ...input },
      perform: async (tx) => {
        await lockInvoice(tx, actor, invoiceId);
        const invoice = await this.requireInvoice(tx, actor, invoiceId);
        if (invoice.status !== "ISSUED") {
          throw new ConflictException("Only issued invoices can be voided");
        }
        const issuedEvent = [...invoice.events]
          .reverse()
          .find((event) => event.type === "ISSUED");
        if (!issuedEvent) {
          throw new ConflictException("Invoice issue evidence is missing");
        }
        await this.financeAccess.authorizeIndependentFinanceApproval(
          actor,
          issuedEvent.actorUserId,
          actor.userId,
        );
        const [allocationCount, issuedCreditCount] = await Promise.all([
          tx.financeReceiptAllocation.count({
            where: {
              invoiceId,
              tenantId: actor.tenantId,
              orgId: actor.orgId,
            },
          }),
          tx.financeCreditNote.count({
            where: {
              invoiceId,
              tenantId: actor.tenantId,
              orgId: actor.orgId,
              status: "ISSUED",
            },
          }),
        ]);
        if (allocationCount || issuedCreditCount) {
          throw new ConflictException(
            "An invoice with financial activity cannot be voided",
          );
        }
        const voidedAt = new Date();
        await tx.financeInvoice.update({
          where: { id: invoiceId },
          data: {
            status: "VOID",
            voidedAt,
            voidedByUserId: actor.userId,
            voidReason: input.reason,
          },
        });
        await this.recordEvent(tx, actor, invoiceId, "VOIDED", input.reason);
        const record = await this.requireInvoice(tx, actor, invoiceId);
        return {
          resourceId: invoiceId,
          value: await this.toInvoiceView(tx, actor, record),
        };
      },
      replay: (tx, resourceId) => this.loadInvoiceView(tx, actor, resourceId),
    });
  }

  private async requireInvoice(
    tx: Prisma.TransactionClient,
    actor: FinanceInvoiceActor,
    invoiceId: string,
  ): Promise<FinanceInvoiceRecord> {
    const record = await this.requireInvoiceOrNull(tx, actor, invoiceId);
    if (!record) throw new NotFoundException("Finance invoice not found");
    return record;
  }

  private requireInvoiceOrNull(
    tx: Prisma.TransactionClient,
    actor: FinanceInvoiceActor,
    invoiceId: string,
  ) {
    return tx.financeInvoice.findFirst({
      where: {
        id: invoiceId,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
      },
      include: financeInvoiceInclude,
    });
  }

  private async loadInvoiceView(
    tx: Prisma.TransactionClient,
    actor: FinanceInvoiceActor,
    invoiceId: string,
  ) {
    const record = await this.requireInvoice(tx, actor, invoiceId);
    return this.toInvoiceView(tx, actor, record);
  }

  private async toInvoiceView(
    tx: Prisma.TransactionClient,
    actor: FinanceInvoiceActor,
    record: FinanceInvoiceRecord,
  ) {
    const balances = await this.balances.forInvoices(tx, actor, [record]);
    const balance = balances.get(record.id);
    if (!balance) {
      throw new Error("Finance invoice balance projection is missing");
    }
    return toFinanceInvoiceView(record, balance);
  }

  private recordEvent(
    tx: Prisma.TransactionClient,
    actor: FinanceInvoiceActor,
    invoiceId: string,
    type:
      | "CREATED"
      | "UPDATED"
      | "SUBMITTED_FOR_REVIEW"
      | "APPROVED"
      | "CHANGES_REQUESTED"
      | "ISSUED"
      | "VOIDED",
    reason?: string,
  ) {
    return tx.financeInvoiceEvent.create({
      data: {
        invoiceId,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        actorUserId: actor.userId,
        type,
        reason,
      },
      select: { id: true },
    });
  }
}
