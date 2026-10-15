import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { FinanceAccessService } from "./access/finance-access.service";
import type { FinanceAccessScope } from "./access/finance-access.reader";
import type {
  FinanceCreditNoteDraftInput,
  FinanceCreditNoteListQuery,
} from "./dto/finance-credit-note.dto";
import type { FinanceRequestChangesInput } from "./dto/finance-invoice.dto";
import { FinanceCommandService } from "./finance-command.service";
import {
  calculateCreditLines,
  lockCreditNote,
  lockInvoice,
  nextCreditNoteNumber,
  validateCreditCapacity,
} from "./finance-credit-note-operations";
import {
  financeCreditNoteInclude,
  toFinanceCreditNoteView,
  type FinanceCreditNoteRecord,
} from "./finance-records";

export interface FinanceCreditNoteActor extends FinanceAccessScope {
  userId: string;
}
@Injectable()
export class FinanceCreditNoteService {
  constructor(
    @Inject(FinanceAccessService)
    private readonly financeAccess: FinanceAccessService,
    @Inject(FinanceCommandService)
    private readonly commands: FinanceCommandService,
  ) {}

  async list(actor: FinanceCreditNoteActor, query: FinanceCreditNoteListQuery) {
    await this.financeAccess.assertStaffAction(actor, "READ_RECORDS");
    const notes = await withTenantRlsContext(
      actor.tenantId,
      actor.orgId,
      (tx) =>
        tx.financeCreditNote.findMany({
          where: {
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            invoiceId: query.invoiceId,
            status: query.status,
          },
          include: financeCreditNoteInclude,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: query.limit,
        }),
    );
    return { items: notes.map(toFinanceCreditNoteView) };
  }

  async get(actor: FinanceCreditNoteActor, creditNoteId: string) {
    await this.financeAccess.assertStaffAction(actor, "READ_RECORDS");
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) =>
      toFinanceCreditNoteView(await this.requireNote(tx, actor, creditNoteId)),
    );
  }

  async createDraft(
    actor: FinanceCreditNoteActor,
    invoiceId: string,
    idempotencyKey: string,
    input: FinanceCreditNoteDraftInput,
  ) {
    await this.financeAccess.assertStaffAction(actor, "CREATE_CREDIT");
    return this.commands.execute({
      actor,
      idempotencyKey,
      commandType: "CREATE_CREDIT_NOTE",
      resourceType: "CREDIT_NOTE",
      request: { invoiceId, input },
      perform: async (tx) => {
        const invoice = await tx.financeInvoice.findFirst({
          where: {
            id: invoiceId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
          },
          include: { lines: true },
        });
        if (!invoice) throw new NotFoundException("Finance invoice not found");
        if (invoice.status !== "ISSUED") {
          throw new ConflictException("Credits require an issued invoice");
        }
        const calculated = calculateCreditLines(invoice.lines, input.lines);
        const note = await tx.financeCreditNote.create({
          data: {
            financeProfileId: invoice.financeProfileId,
            invoiceId: invoice.id,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            createdByUserId: actor.userId,
            reason: input.reason,
            subtotalMinor: calculated.totals.subtotalMinor,
            taxMinor: calculated.totals.taxMinor,
            totalMinor: calculated.totals.totalMinor,
          },
          select: { id: true },
        });
        await tx.financeCreditNoteLine.createMany({
          data: calculated.lines.map((line, index) => ({
            creditNoteId: note.id,
            invoiceId: invoice.id,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            sourceInvoiceLineId: input.lines[index].sourceInvoiceLineId,
            description: line.description,
            quantity: new Prisma.Decimal(line.quantity),
            unitAmountMinor: BigInt(line.unitAmountMinor),
            taxRateBasisPoints: line.taxRateBasisPoints,
            netAmountMinor: line.netAmountMinor,
            taxAmountMinor: line.taxAmountMinor,
            totalMinor: line.totalMinor,
          })),
        });
        await this.recordEvent(tx, actor, note.id, "CREATED");
        return {
          resourceId: note.id,
          value: toFinanceCreditNoteView(
            await this.requireNote(tx, actor, note.id),
          ),
        };
      },
      replay: (tx, id) => this.loadNoteView(tx, actor, id),
    });
  }

  async updateDraft(
    actor: FinanceCreditNoteActor,
    creditNoteId: string,
    idempotencyKey: string,
    input: FinanceCreditNoteDraftInput,
  ) {
    await this.financeAccess.assertStaffAction(actor, "CREATE_CREDIT");
    return this.commands.execute({
      actor,
      idempotencyKey,
      commandType: "UPDATE_CREDIT_NOTE",
      resourceType: "CREDIT_NOTE",
      request: { creditNoteId, input },
      perform: async (tx) => {
        await lockCreditNote(tx, actor, creditNoteId);
        const note = await this.requireNote(tx, actor, creditNoteId);
        if (note.status !== "DRAFT") {
          throw new ConflictException("Only draft credit notes can be edited");
        }
        const invoice = await tx.financeInvoice.findFirst({
          where: {
            id: note.invoiceId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
          },
          include: { lines: true },
        });
        if (!invoice || invoice.status !== "ISSUED") {
          throw new ConflictException("Credits require an issued invoice");
        }
        const calculated = calculateCreditLines(invoice.lines, input.lines);
        await tx.financeCreditNoteLine.deleteMany({
          where: { creditNoteId, tenantId: actor.tenantId, orgId: actor.orgId },
        });
        await tx.financeCreditNoteLine.createMany({
          data: calculated.lines.map((line, index) => ({
            creditNoteId,
            invoiceId: note.invoiceId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            sourceInvoiceLineId: input.lines[index].sourceInvoiceLineId,
            description: line.description,
            quantity: new Prisma.Decimal(line.quantity),
            unitAmountMinor: BigInt(line.unitAmountMinor),
            taxRateBasisPoints: line.taxRateBasisPoints,
            netAmountMinor: line.netAmountMinor,
            taxAmountMinor: line.taxAmountMinor,
            totalMinor: line.totalMinor,
          })),
        });
        await tx.financeCreditNote.update({
          where: { id: creditNoteId },
          data: {
            reason: input.reason,
            subtotalMinor: calculated.totals.subtotalMinor,
            taxMinor: calculated.totals.taxMinor,
            totalMinor: calculated.totals.totalMinor,
          },
        });
        await this.recordEvent(tx, actor, creditNoteId, "UPDATED");
        return {
          resourceId: creditNoteId,
          value: toFinanceCreditNoteView(
            await this.requireNote(tx, actor, creditNoteId),
          ),
        };
      },
      replay: (tx, id) => this.loadNoteView(tx, actor, id),
    });
  }

  async submitForReview(
    actor: FinanceCreditNoteActor,
    creditNoteId: string,
    idempotencyKey: string,
  ) {
    await this.financeAccess.assertStaffAction(
      actor,
      "SUBMIT_CREDIT_FOR_REVIEW",
    );
    return this.commands.execute({
      actor,
      idempotencyKey,
      commandType: "SUBMIT_CREDIT_FOR_REVIEW",
      resourceType: "CREDIT_NOTE",
      request: { creditNoteId },
      perform: async (tx) => {
        await lockCreditNote(tx, actor, creditNoteId);
        const note = await this.requireNote(tx, actor, creditNoteId);
        if (note.status !== "DRAFT" || note.lines.length === 0) {
          throw new ConflictException(
            "Only complete draft credit notes can enter review",
          );
        }
        const invoice = await this.requireIssuedInvoice(
          tx,
          actor,
          note.invoiceId,
        );
        await validateCreditCapacity(tx, actor, invoice, note.lines);
        await tx.financeCreditNote.update({
          where: { id: creditNoteId },
          data: { status: "IN_REVIEW" },
        });
        await this.recordEvent(tx, actor, creditNoteId, "SUBMITTED_FOR_REVIEW");
        return {
          resourceId: creditNoteId,
          value: toFinanceCreditNoteView(
            await this.requireNote(tx, actor, creditNoteId),
          ),
        };
      },
      replay: (tx, id) => this.loadNoteView(tx, actor, id),
    });
  }

  async approve(
    actor: FinanceCreditNoteActor,
    creditNoteId: string,
    idempotencyKey: string,
  ) {
    await this.financeAccess.assertStaffAction(actor, "REVIEW_INVOICE");
    return this.commands.execute({
      actor,
      idempotencyKey,
      commandType: "APPROVE_CREDIT_NOTE",
      resourceType: "CREDIT_NOTE",
      request: { creditNoteId },
      perform: async (tx) => {
        await lockCreditNote(tx, actor, creditNoteId);
        const note = await this.requireNote(tx, actor, creditNoteId);
        if (note.status !== "IN_REVIEW" || note.approvedAt) {
          throw new ConflictException("Credit note is not awaiting review");
        }
        if (!note.createdByUserId) {
          throw new ConflictException(
            "Credit note creator evidence is missing",
          );
        }
        await this.financeAccess.authorizeIndependentFinanceApproval(
          actor,
          note.createdByUserId,
          actor.userId,
        );
        await tx.financeCreditNote.update({
          where: { id: creditNoteId },
          data: { approvedAt: new Date(), approvedByUserId: actor.userId },
        });
        await this.recordEvent(tx, actor, creditNoteId, "APPROVED");
        return {
          resourceId: creditNoteId,
          value: toFinanceCreditNoteView(
            await this.requireNote(tx, actor, creditNoteId),
          ),
        };
      },
      replay: (tx, id) => this.loadNoteView(tx, actor, id),
    });
  }

  async requestChanges(
    actor: FinanceCreditNoteActor,
    creditNoteId: string,
    idempotencyKey: string,
    input: FinanceRequestChangesInput,
  ) {
    await this.financeAccess.assertStaffAction(actor, "REVIEW_INVOICE");
    return this.commands.execute({
      actor,
      idempotencyKey,
      commandType: "REQUEST_CREDIT_CHANGES",
      resourceType: "CREDIT_NOTE",
      request: { creditNoteId, ...input },
      perform: async (tx) => {
        await lockCreditNote(tx, actor, creditNoteId);
        const note = await this.requireNote(tx, actor, creditNoteId);
        if (note.status !== "IN_REVIEW") {
          throw new ConflictException(
            "Only credit notes in review can be returned",
          );
        }
        if (!note.createdByUserId) {
          throw new ConflictException(
            "Credit note creator evidence is missing",
          );
        }
        await this.financeAccess.authorizeIndependentFinanceApproval(
          actor,
          note.createdByUserId,
          actor.userId,
        );
        await tx.financeCreditNote.update({
          where: { id: creditNoteId },
          data: {
            status: "DRAFT",
            approvedAt: null,
            approvedByUserId: null,
          },
        });
        await this.recordEvent(
          tx,
          actor,
          creditNoteId,
          "CHANGES_REQUESTED",
          input.reason,
        );
        return {
          resourceId: creditNoteId,
          value: toFinanceCreditNoteView(
            await this.requireNote(tx, actor, creditNoteId),
          ),
        };
      },
      replay: (tx, id) => this.loadNoteView(tx, actor, id),
    });
  }

  async issue(
    actor: FinanceCreditNoteActor,
    creditNoteId: string,
    idempotencyKey: string,
  ) {
    await this.financeAccess.assertStaffAction(actor, "ISSUE_CREDIT");
    return this.commands.execute({
      actor,
      idempotencyKey,
      commandType: "ISSUE_CREDIT_NOTE",
      resourceType: "CREDIT_NOTE",
      request: { creditNoteId },
      perform: async (tx) => {
        const peek = await this.requireNote(tx, actor, creditNoteId);
        await lockInvoice(tx, actor, peek.invoiceId);
        await lockCreditNote(tx, actor, creditNoteId);
        const note = await this.requireNote(tx, actor, creditNoteId);
        if (
          note.status !== "IN_REVIEW" ||
          !note.approvedAt ||
          !note.approvedByUserId ||
          !note.createdByUserId ||
          note.createdByUserId === note.approvedByUserId
        ) {
          throw new ConflictException(
            "A credit note must be independently approved before issue",
          );
        }
        const approvalEvent = note.events.find(
          (event) =>
            event.type === "APPROVED" &&
            event.actorUserId === note.approvedByUserId,
        );
        if (!approvalEvent) {
          throw new ConflictException(
            "Credit note approval evidence is missing",
          );
        }
        const invoice = await this.requireIssuedInvoice(
          tx,
          actor,
          note.invoiceId,
        );
        await validateCreditCapacity(tx, actor, invoice, note.lines, note.id);
        const number = await nextCreditNoteNumber(
          tx,
          actor,
          note.financeProfileId,
        );
        await tx.financeCreditNote.update({
          where: { id: note.id },
          data: {
            status: "ISSUED",
            creditNumber: number,
            issuedAt: new Date(),
            payerNameSnapshot: invoice.payerNameSnapshot,
            legalEntityNameSnapshot: invoice.legalEntityNameSnapshot,
          },
        });
        await this.recordEvent(tx, actor, note.id, "ISSUED");
        return {
          resourceId: note.id,
          value: toFinanceCreditNoteView(
            await this.requireNote(tx, actor, note.id),
          ),
        };
      },
      replay: (tx, id) => this.loadNoteView(tx, actor, id),
    });
  }

  async void(
    actor: FinanceCreditNoteActor,
    creditNoteId: string,
    idempotencyKey: string,
    input: { reason: string },
  ) {
    await this.financeAccess.assertStaffAction(actor, "VOID_CREDIT");
    return this.commands.execute({
      actor,
      idempotencyKey,
      commandType: "VOID_CREDIT_NOTE",
      resourceType: "CREDIT_NOTE",
      request: { creditNoteId, ...input },
      perform: async (tx) => {
        await lockCreditNote(tx, actor, creditNoteId);
        const note = await this.requireNote(tx, actor, creditNoteId);
        if (note.status !== "DRAFT" && note.status !== "IN_REVIEW") {
          throw new ConflictException(
            "Only unissued credit notes can be voided",
          );
        }
        await tx.financeCreditNote.update({
          where: { id: creditNoteId },
          data: {
            status: "VOID",
            approvedAt: null,
            approvedByUserId: null,
            voidedAt: new Date(),
            voidedByUserId: actor.userId,
          },
        });
        await this.recordEvent(tx, actor, creditNoteId, "VOIDED", input.reason);
        return {
          resourceId: creditNoteId,
          value: toFinanceCreditNoteView(
            await this.requireNote(tx, actor, creditNoteId),
          ),
        };
      },
      replay: (tx, id) => this.loadNoteView(tx, actor, id),
    });
  }

  private async requireNote(
    tx: Prisma.TransactionClient,
    actor: FinanceCreditNoteActor,
    creditNoteId: string,
  ): Promise<FinanceCreditNoteRecord> {
    const note = await tx.financeCreditNote.findFirst({
      where: {
        id: creditNoteId,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
      },
      include: financeCreditNoteInclude,
    });
    if (!note) throw new NotFoundException("Finance credit note not found");
    return note;
  }

  private async requireIssuedInvoice(
    tx: Prisma.TransactionClient,
    actor: FinanceCreditNoteActor,
    invoiceId: string,
  ) {
    const invoice = await tx.financeInvoice.findFirst({
      where: {
        id: invoiceId,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
      },
      include: { lines: true },
    });
    if (!invoice) throw new NotFoundException("Finance invoice not found");
    if (invoice.status !== "ISSUED") {
      throw new ConflictException("Credits require an issued invoice");
    }
    return invoice;
  }

  private async loadNoteView(
    tx: Prisma.TransactionClient,
    actor: FinanceCreditNoteActor,
    creditNoteId: string,
  ) {
    return toFinanceCreditNoteView(
      await this.requireNote(tx, actor, creditNoteId),
    );
  }

  private recordEvent(
    tx: Prisma.TransactionClient,
    actor: FinanceCreditNoteActor,
    creditNoteId: string,
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
    return tx.financeCreditNoteEvent.create({
      data: {
        creditNoteId,
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
