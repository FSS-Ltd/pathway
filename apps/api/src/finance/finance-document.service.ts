import {
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { FinanceAccessService } from "./access/finance-access.service";
import type { FinanceAccessScope } from "./access/finance-access.reader";
import { SupabaseStorageService } from "../common/storage/supabase-storage.service";
import { financeDocumentStorageKey } from "../common/storage/storage-key.util";
import { renderFinancePdf, type FinancePdfInput } from "./finance-document-pdf";

export interface FinanceDocumentActor extends FinanceAccessScope {
  userId: string;
}

type FinanceDocumentKind = "invoice" | "credit-note" | "receipt";

@Injectable()
export class FinanceDocumentService {
  constructor(
    @Inject(FinanceAccessService)
    private readonly access: FinanceAccessService,
    @Inject(SupabaseStorageService)
    private readonly storage: SupabaseStorageService,
  ) {}

  async invoiceForStaff(actor: FinanceDocumentActor, invoiceId: string) {
    await this.access.assertStaffAction(actor, "DOWNLOAD_DOCUMENT");
    return this.invoice(actor, invoiceId);
  }

  async invoiceForPayer(
    actor: FinanceDocumentActor,
    payerAccountId: string,
    invoiceId: string,
  ) {
    await this.access.assertPayerAction(
      actor,
      actor.userId,
      payerAccountId,
      "DOWNLOAD_DOCUMENT",
    );
    return this.invoice(actor, invoiceId, payerAccountId);
  }

  async creditForStaff(actor: FinanceDocumentActor, creditNoteId: string) {
    await this.access.assertStaffAction(actor, "DOWNLOAD_DOCUMENT");
    return this.credit(actor, creditNoteId);
  }

  async creditForPayer(
    actor: FinanceDocumentActor,
    payerAccountId: string,
    creditNoteId: string,
  ) {
    await this.access.assertPayerAction(
      actor,
      actor.userId,
      payerAccountId,
      "DOWNLOAD_DOCUMENT",
    );
    return this.credit(actor, creditNoteId, payerAccountId);
  }

  async receiptForStaff(actor: FinanceDocumentActor, receiptId: string) {
    await this.access.assertStaffAction(actor, "DOWNLOAD_DOCUMENT");
    return this.receipt(actor, receiptId);
  }

  async receiptForPayer(
    actor: FinanceDocumentActor,
    payerAccountId: string,
    receiptId: string,
  ) {
    await this.access.assertPayerAction(
      actor,
      actor.userId,
      payerAccountId,
      "DOWNLOAD_DOCUMENT",
    );
    return this.receipt(actor, receiptId, payerAccountId);
  }

  private async invoice(
    actor: FinanceDocumentActor,
    invoiceId: string,
    payerAccountId?: string,
  ) {
    const invoice = await withTenantRlsContext(
      actor.tenantId,
      actor.orgId,
      (tx) =>
        tx.financeInvoice.findFirst({
          where: {
            id: invoiceId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            ...(payerAccountId ? { payerAccountId } : {}),
            status: { in: ["ISSUED", "VOID"] },
            issuedAt: { not: null },
          },
          include: {
            lines: { orderBy: { lineOrder: "asc" } },
            payerAccount: { select: { id: true, displayName: true } },
          },
        }),
    );
    if (!invoice || !invoice.issuedAt || !invoice.invoiceNumber) {
      throw new NotFoundException("Finance invoice document not found");
    }
    const number = `INV-${invoice.invoiceNumber.toString()}`;
    const pdf: FinancePdfInput = {
      title: `Invoice ${number}`,
      legalEntityName: invoice.legalEntityNameSnapshot ?? "School",
      payerName:
        invoice.payerNameSnapshot ??
        invoice.payerAccount?.displayName ??
        "Family account",
      reference: invoice.dueAt
        ? `${number} · Due ${invoice.dueAt.toISOString().slice(0, 10)}`
        : number,
      generatedAt: invoice.issuedAt.toISOString(),
      currency: invoice.currency,
      totals: [
        { label: "Subtotal", amountMinor: invoice.subtotalMinor.toString() },
        { label: "Tax", amountMinor: invoice.taxMinor.toString() },
        {
          label: "Invoice total",
          amountMinor: invoice.totalMinor.toString(),
          emphasized: true,
        },
      ],
      lines: invoice.lines.map((line) => ({
        description: line.description,
        amountMinor: line.totalMinor.toString(),
      })),
    };
    return this.storeAndReturn(
      actor,
      "invoice",
      invoice.id,
      number,
      pdf,
      payerAccountId,
    );
  }

  private async credit(
    actor: FinanceDocumentActor,
    creditNoteId: string,
    payerAccountId?: string,
  ) {
    const credit = await withTenantRlsContext(
      actor.tenantId,
      actor.orgId,
      (tx) =>
        tx.financeCreditNote.findFirst({
          where: {
            id: creditNoteId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            ...(payerAccountId ? { invoice: { is: { payerAccountId } } } : {}),
            status: { in: ["ISSUED", "VOID"] },
            issuedAt: { not: null },
          },
          include: {
            lines: { orderBy: { createdAt: "asc" } },
            invoice: { select: { invoiceNumber: true } },
          },
        }),
    );
    if (!credit || !credit.issuedAt || !credit.creditNumber) {
      throw new NotFoundException("Finance credit document not found");
    }
    const number = `CN-${credit.creditNumber.toString()}`;
    const pdf: FinancePdfInput = {
      title: `Credit note ${number}`,
      legalEntityName: credit.legalEntityNameSnapshot ?? "School",
      payerName: credit.payerNameSnapshot ?? "Family account",
      reference: `${number} · Invoice INV-${credit.invoice.invoiceNumber?.toString() ?? "—"}`,
      generatedAt: credit.issuedAt.toISOString(),
      currency: credit.currency,
      totals: [
        {
          label: "Subtotal",
          amountMinor: `-${credit.subtotalMinor.toString()}`,
        },
        { label: "Tax", amountMinor: `-${credit.taxMinor.toString()}` },
        {
          label: "Credit amount",
          amountMinor: `-${credit.totalMinor.toString()}`,
          emphasized: true,
        },
      ],
      lines: credit.lines.map((line) => ({
        description: line.description,
        amountMinor: `-${line.totalMinor.toString()}`,
      })),
    };
    return this.storeAndReturn(
      actor,
      "credit-note",
      credit.id,
      number,
      pdf,
      payerAccountId,
    );
  }

  private async receipt(
    actor: FinanceDocumentActor,
    receiptId: string,
    payerAccountId?: string,
  ) {
    const receipt = await withTenantRlsContext(
      actor.tenantId,
      actor.orgId,
      (tx) =>
        tx.financeReceipt.findFirst({
          where: {
            id: receiptId,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            ...(payerAccountId ? { payerAccountId } : {}),
            status: "CONFIRMED",
          },
          include: {
            payerAccount: { select: { displayName: true } },
            financeProfile: { select: { legalEntityName: true } },
          },
        }),
    );
    if (!receipt || !receipt.payerAccountId || !receipt.confirmedAt) {
      throw new NotFoundException("Confirmed Finance receipt not found");
    }
    const reference = receipt.sourceReference ?? receipt.id;
    const pdf: FinancePdfInput = {
      title: "Payment receipt",
      legalEntityName: receipt.financeProfile.legalEntityName,
      payerName: receipt.payerAccount?.displayName ?? "Family account",
      reference,
      generatedAt: receipt.confirmedAt.toISOString(),
      currency: receipt.currency,
      totals: [
        {
          label: "Confirmed payment",
          amountMinor: receipt.amountMinor.toString(),
          emphasized: true,
        },
      ],
      lines: [
        {
          date: receipt.confirmedAt.toISOString(),
          description: `Confirmed ${receipt.source.toLowerCase().replaceAll("_", " ")} payment`,
          amountMinor: receipt.amountMinor.toString(),
        },
      ],
    };
    return this.storeAndReturn(
      actor,
      "receipt",
      receipt.id,
      `receipt-${reference}`,
      pdf,
      payerAccountId,
    );
  }

  private async storeAndReturn(
    actor: FinanceDocumentActor,
    kind: FinanceDocumentKind,
    documentId: string,
    reference: string,
    input: FinancePdfInput,
    payerAccountId?: string,
  ) {
    const bytes = await renderFinancePdf(input);
    const stored = await this.storage.uploadObject({
      bucket: "private",
      key: financeDocumentStorageKey(actor.tenantId, kind, documentId),
      body: bytes,
      contentType: "application/pdf",
    });
    if (!stored) {
      throw new ServiceUnavailableException(
        "Finance document storage is unavailable",
      );
    }
    if (payerAccountId) {
      await this.access.assertPayerAction(
        actor,
        actor.userId,
        payerAccountId,
        "DOWNLOAD_DOCUMENT",
      );
    } else {
      await this.access.assertStaffAction(actor, "DOWNLOAD_DOCUMENT");
    }
    return {
      bytes,
      fileName: `${safeFileSegment(reference)}.pdf`,
    };
  }
}

function safeFileSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "-");
}
