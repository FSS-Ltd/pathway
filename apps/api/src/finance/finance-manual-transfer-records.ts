import { Prisma } from "@pathway/db";

export const financeBankTransferChangeSelect = {
  id: true,
  financeProfileId: true,
  accountHolderName: true,
  sortCode: true,
  accountNumber: true,
  reason: true,
  status: true,
  requestedByUserId: true,
  decidedByUserId: true,
  decisionReason: true,
  decidedAt: true,
  createdAt: true,
} as const;

export type FinanceBankTransferChangeRecord =
  Prisma.FinanceBankTransferChangeGetPayload<{
    select: typeof financeBankTransferChangeSelect;
  }>;

export const financeManualReceiptRequestInclude = {
  payerAccount: { select: { id: true, displayName: true } },
  transferNotice: { select: { id: true, invoiceNumber: true } },
} as const;

export type FinanceManualReceiptRequestRecord =
  Prisma.FinanceManualReceiptRequestGetPayload<{
    include: typeof financeManualReceiptRequestInclude;
  }>;

export const financeTransferNoticeInclude = {
  invoice: { select: { id: true, invoiceNumber: true, currency: true } },
  payerAccount: { select: { id: true, displayName: true } },
  manualReceiptRequest: {
    select: { id: true, status: true, receiptId: true },
  },
} as const;

export type FinanceTransferNoticeRecord =
  Prisma.FinanceTransferNoticeGetPayload<{
    include: typeof financeTransferNoticeInclude;
  }>;

export function toFinanceBankTransferChangeView(
  change: FinanceBankTransferChangeRecord,
) {
  return {
    id: change.id,
    financeProfileId: change.financeProfileId,
    accountHolderName: change.accountHolderName,
    sortCode: change.sortCode,
    accountNumber: change.accountNumber,
    reason: change.reason,
    status: change.status,
    requestedByUserId: change.requestedByUserId,
    decidedByUserId: change.decidedByUserId,
    decisionReason: change.decisionReason,
    decidedAt: change.decidedAt?.toISOString() ?? null,
    createdAt: change.createdAt.toISOString(),
  };
}

export function toFinanceManualReceiptRequestView(
  request: FinanceManualReceiptRequestRecord,
) {
  return {
    id: request.id,
    financeProfileId: request.financeProfileId,
    payerAccountId: request.payerAccountId,
    payerName: request.payerAccount.displayName,
    transferNoticeId: request.transferNoticeId,
    invoiceNumber: request.transferNotice?.invoiceNumber.toString() ?? null,
    bankTransactionReference: request.bankTransactionReference,
    amountMinor: request.amountMinor.toString(),
    currency: request.currency,
    receivedAt: request.receivedAt.toISOString(),
    reason: request.requestReason,
    status: request.status,
    receiptId: request.receiptId,
    requestedByUserId: request.requestedByUserId,
    decidedByUserId: request.decidedByUserId,
    decisionReason: request.decisionReason,
    decidedAt: request.decidedAt?.toISOString() ?? null,
    createdAt: request.createdAt.toISOString(),
  };
}

export function toFinanceTransferNoticeView(
  notice: FinanceTransferNoticeRecord,
) {
  return {
    id: notice.id,
    payerAccountId: notice.payerAccountId,
    payerName: notice.payerAccount.displayName,
    invoiceId: notice.invoice.id,
    invoiceNumber: notice.invoiceNumber.toString(),
    amountMinor: notice.amountMinor.toString(),
    currency: notice.invoice.currency,
    declaredTransferredAt: notice.declaredTransferredAt.toISOString(),
    submittedAt: notice.createdAt.toISOString(),
    receiptStatus: "DECLARED_ONLY" as const,
    manualReceiptRequest: notice.manualReceiptRequest
      ? {
          id: notice.manualReceiptRequest.id,
          status: notice.manualReceiptRequest.status,
          receiptId: notice.manualReceiptRequest.receiptId,
        }
      : null,
  };
}
