import { Prisma } from "@pathway/db";

export const financeInvoiceInclude = {
  payerAccount: { select: { id: true, displayName: true } },
  lines: { orderBy: { lineOrder: "asc" } },
  events: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      type: true,
      actorUserId: true,
      reason: true,
      createdAt: true,
    },
  },
} as const;

export const financeCreditNoteInclude = {
  lines: { orderBy: { createdAt: "asc" } },
  events: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      type: true,
      actorUserId: true,
      reason: true,
      createdAt: true,
    },
  },
} as const;

export type FinanceInvoiceRecord = Prisma.FinanceInvoiceGetPayload<{
  include: typeof financeInvoiceInclude;
}>;

export type FinanceCreditNoteRecord = Prisma.FinanceCreditNoteGetPayload<{
  include: typeof financeCreditNoteInclude;
}>;

export function toFinanceInvoiceView(record: FinanceInvoiceRecord) {
  return {
    id: record.id,
    financeProfileId: record.financeProfileId,
    payerAccountId: record.payerAccountId,
    payerName:
      record.status === "DRAFT" || record.status === "IN_REVIEW"
        ? (record.payerAccount?.displayName ?? null)
        : record.payerNameSnapshot,
    payerNameSnapshot: record.payerNameSnapshot,
    legalEntityNameSnapshot: record.legalEntityNameSnapshot,
    invoiceNumber: record.invoiceNumber?.toString() ?? null,
    status: record.status,
    currency: record.currency,
    subtotalMinor: record.subtotalMinor.toString(),
    taxMinor: record.taxMinor.toString(),
    totalMinor: record.totalMinor.toString(),
    issuedAt: record.issuedAt?.toISOString() ?? null,
    dueDate: record.dueAt ? dateOnly(record.dueAt) : null,
    approvedAt: record.approvedAt?.toISOString() ?? null,
    approvedByUserId: record.approvedByUserId,
    voidedAt: record.voidedAt?.toISOString() ?? null,
    voidedByUserId: record.voidedByUserId,
    voidReason: record.voidReason,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    lines: record.lines.map((line) => ({
      id: line.id,
      lineOrder: line.lineOrder,
      description: line.description,
      quantity: line.quantity.toString(),
      unitAmountMinor: line.unitAmountMinor.toString(),
      taxRateBasisPoints: line.taxRateBasisPoints,
      netAmountMinor: line.netAmountMinor.toString(),
      taxAmountMinor: line.taxAmountMinor.toString(),
      totalMinor: line.totalMinor.toString(),
    })),
    events: record.events.map((event) => ({
      id: event.id,
      type: event.type,
      actorUserId: event.actorUserId,
      reason: event.reason,
      createdAt: event.createdAt.toISOString(),
    })),
  };
}

export function toFinanceCreditNoteView(record: FinanceCreditNoteRecord) {
  return {
    id: record.id,
    financeProfileId: record.financeProfileId,
    invoiceId: record.invoiceId,
    creditNumber: record.creditNumber?.toString() ?? null,
    status: record.status,
    reason: record.reason,
    currency: record.currency,
    subtotalMinor: record.subtotalMinor.toString(),
    taxMinor: record.taxMinor.toString(),
    totalMinor: record.totalMinor.toString(),
    payerNameSnapshot: record.payerNameSnapshot,
    legalEntityNameSnapshot: record.legalEntityNameSnapshot,
    createdByUserId: record.createdByUserId,
    approvedAt: record.approvedAt?.toISOString() ?? null,
    approvedByUserId: record.approvedByUserId,
    issuedAt: record.issuedAt?.toISOString() ?? null,
    voidedAt: record.voidedAt?.toISOString() ?? null,
    voidedByUserId: record.voidedByUserId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    lines: record.lines.map((line) => ({
      id: line.id,
      sourceInvoiceLineId: line.sourceInvoiceLineId,
      description: line.description,
      quantity: line.quantity.toString(),
      unitAmountMinor: line.unitAmountMinor.toString(),
      taxRateBasisPoints: line.taxRateBasisPoints,
      netAmountMinor: line.netAmountMinor.toString(),
      taxAmountMinor: line.taxAmountMinor.toString(),
      totalMinor: line.totalMinor.toString(),
    })),
    events: record.events.map((event) => ({
      id: event.id,
      type: event.type,
      actorUserId: event.actorUserId,
      reason: event.reason,
      createdAt: event.createdAt.toISOString(),
    })),
  };
}

export function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
