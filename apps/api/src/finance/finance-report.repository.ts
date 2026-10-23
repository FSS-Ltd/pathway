import { ConflictException, Inject, Injectable } from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import type { FinanceRequestActor } from "./finance-controller-support";
import type { FinanceReportFilters } from "./dto/finance-report.dto";
import { FinanceBalanceService } from "./finance-balance.service";
import {
  ageingBucket,
  calculateFinanceReportTotals,
  financeLocalDateKey,
  financeReportRow,
  netAllocationMinor,
  receiptUnapplied,
  sumMinorUnits,
} from "./finance-report-projection";
import { resolveFinanceReportPeriod } from "./finance-report-period";
import { loadFinanceExternalRefundReviews } from "./finance-external-refund-report";
import { loadFinanceWebhookExceptions } from "./finance-webhook-exceptions";
import type {
  FinanceReportInvoice,
  FinanceReportMetadata,
  FinanceReportRow,
  FinanceReportSnapshot,
} from "./finance-report.types";

const INVOICE_BATCH_SIZE = 250;

@Injectable()
export class FinanceReportRepository {
  constructor(
    @Inject(FinanceBalanceService)
    private readonly balances: FinanceBalanceService,
  ) {}

  async loadSnapshot(
    actor: FinanceRequestActor,
    filters: FinanceReportFilters,
  ): Promise<FinanceReportSnapshot> {
    const generatedAt = new Date();
    const period = resolveFinanceReportPeriod(filters);
    const loaded = await withTenantRlsContext(
      actor.tenantId,
      actor.orgId,
      async (tx) => {
        const profile = await tx.financeProfile.findUnique({
          where: {
            tenantId_orgId: { tenantId: actor.tenantId, orgId: actor.orgId },
          },
          select: { id: true, legalEntityName: true, currency: true },
        });
        if (!profile)
          return { profile: null, connection: null, rows: [], totals: null };

        const connection = await tx.financeStripeConnection.findFirst({
          where: {
            financeProfileId: profile.id,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            stripeAccountId: { not: null },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            stripeAccountId: true,
            livemode: true,
            status: true,
          },
        });

        const [
          invoices,
          periodCredits,
          periodReceipts,
          periodMovements,
          periodAllocations,
          confirmedReceipts,
          processingReceipts,
          pendingManualReceipts,
          pendingRefunds,
          failedReceipts,
          transferNotices,
        ] = await Promise.all([
          loadInvoiceBalances(tx, actor, this.balances, period.asOfCutoff),
          tx.financeCreditNote.findMany({
            where: {
              tenantId: actor.tenantId,
              orgId: actor.orgId,
              status: { in: ["ISSUED", "VOID"] },
              issuedAt: {
                gte: period.periodStart,
                lt: period.periodEnd,
                lte: period.asOfCutoff,
              },
              createdAt: { lte: period.asOfCutoff },
            },
            select: {
              creditNumber: true,
              totalMinor: true,
              issuedAt: true,
              currency: true,
              invoice: {
                select: { payerAccount: { select: { displayName: true } } },
              },
            },
          }),
          tx.financeReceipt.findMany({
            where: {
              tenantId: actor.tenantId,
              orgId: actor.orgId,
              status: "CONFIRMED",
              confirmedAt: {
                gte: period.periodStart,
                lt: period.periodEnd,
                lte: period.asOfCutoff,
              },
              createdAt: { lte: period.asOfCutoff },
            },
            select: {
              id: true,
              payerAccount: { select: { displayName: true } },
              amountMinor: true,
              currency: true,
              confirmedAt: true,
              allocations: {
                where: { createdAt: { lte: period.asOfCutoff } },
                select: {
                  amountMinor: true,
                  invoice: { select: { invoiceNumber: true } },
                  reversals: {
                    where: { createdAt: { lte: period.asOfCutoff } },
                    select: { amountMinor: true },
                  },
                  movementApplications: {
                    where: { createdAt: { lte: period.asOfCutoff } },
                    select: {
                      amountMinor: true,
                      movement: { select: { type: true } },
                    },
                  },
                },
              },
              movements: {
                where: {
                  occurredAt: { lte: period.asOfCutoff },
                  createdAt: { lte: period.asOfCutoff },
                },
                select: { amountMinor: true, type: true },
              },
            },
            orderBy: [{ confirmedAt: "desc" }, { id: "desc" }],
          }),
          tx.financeReceiptMovement.findMany({
            where: {
              tenantId: actor.tenantId,
              orgId: actor.orgId,
              occurredAt: {
                gte: period.periodStart,
                lt: period.periodEnd,
                lte: period.asOfCutoff,
              },
              createdAt: { lte: period.asOfCutoff },
              type: {
                in: [
                  "REFUND",
                  "REFUND_RETURN",
                  "DISPUTE_WITHDRAWAL",
                  "DISPUTE_REINSTATEMENT",
                ],
              },
            },
            select: {
              type: true,
              amountMinor: true,
              occurredAt: true,
              currency: true,
              sourceReference: true,
            },
            orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
          }),
          tx.financeReceiptAllocation.findMany({
            where: {
              tenantId: actor.tenantId,
              orgId: actor.orgId,
              createdAt: {
                gte: period.periodStart,
                lt: period.periodEnd,
                lte: period.asOfCutoff,
              },
              receipt: {
                is: {
                  status: "CONFIRMED",
                  confirmedAt: { lte: period.asOfCutoff },
                  createdAt: { lte: period.asOfCutoff },
                },
              },
            },
            select: {
              amountMinor: true,
              createdAt: true,
              invoice: {
                select: {
                  invoiceNumber: true,
                  payerAccount: { select: { displayName: true } },
                },
              },
              reversals: {
                where: { createdAt: { lte: period.asOfCutoff } },
                select: { amountMinor: true },
              },
            },
          }),
          tx.financeReceipt.findMany({
            where: {
              tenantId: actor.tenantId,
              orgId: actor.orgId,
              status: "CONFIRMED",
              confirmedAt: { lte: period.asOfCutoff },
              createdAt: { lte: period.asOfCutoff },
            },
            select: {
              id: true,
              amountMinor: true,
              currency: true,
              confirmedAt: true,
              payerAccount: { select: { displayName: true } },
              movements: {
                where: {
                  occurredAt: { lte: period.asOfCutoff },
                  createdAt: { lte: period.asOfCutoff },
                },
                select: { amountMinor: true, type: true },
              },
              allocations: {
                where: { createdAt: { lte: period.asOfCutoff } },
                select: {
                  amountMinor: true,
                  reversals: {
                    where: { createdAt: { lte: period.asOfCutoff } },
                    select: { amountMinor: true },
                  },
                  movementApplications: {
                    where: { createdAt: { lte: period.asOfCutoff } },
                    select: {
                      amountMinor: true,
                      movement: { select: { type: true } },
                    },
                  },
                },
              },
            },
          }),
          tx.financeReceipt.findMany({
            where: {
              tenantId: actor.tenantId,
              orgId: actor.orgId,
              status: "PROCESSING",
              createdAt: { lte: period.asOfCutoff },
            },
            select: {
              id: true,
              amountMinor: true,
              currency: true,
              createdAt: true,
              payerAccount: { select: { displayName: true } },
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          }),
          tx.financeManualReceiptRequest.findMany({
            where: {
              tenantId: actor.tenantId,
              orgId: actor.orgId,
              status: "PENDING",
              createdAt: { lte: period.asOfCutoff },
            },
            select: {
              id: true,
              amountMinor: true,
              currency: true,
              createdAt: true,
              payerAccount: { select: { displayName: true } },
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          }),
          tx.financeRefund.findMany({
            where: {
              tenantId: actor.tenantId,
              orgId: actor.orgId,
              status: { in: ["PENDING", "APPROVED", "SUBMITTED"] },
              createdAt: { lte: period.asOfCutoff },
            },
            select: {
              id: true,
              amountMinor: true,
              currency: true,
              createdAt: true,
              status: true,
              receipt: {
                select: { payerAccount: { select: { displayName: true } } },
              },
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          }),
          tx.financeReceipt.findMany({
            where: {
              tenantId: actor.tenantId,
              orgId: actor.orgId,
              status: "FAILED",
              createdAt: { lte: period.asOfCutoff },
            },
            select: {
              id: true,
              amountMinor: true,
              currency: true,
              createdAt: true,
              payerAccount: { select: { displayName: true } },
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          }),
          tx.financeTransferNotice.findMany({
            where: {
              tenantId: actor.tenantId,
              orgId: actor.orgId,
              createdAt: { lte: period.asOfCutoff },
              manualReceiptRequest: null,
            },
            select: {
              id: true,
              amountMinor: true,
              createdAt: true,
              payerAccount: { select: { displayName: true } },
              invoice: { select: { invoiceNumber: true, currency: true } },
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          }),
        ]);

        const ledgerCurrencies = new Set([
          ...invoices.map((item) => item.currency),
          ...periodCredits.map((item) => item.currency),
          ...periodReceipts.map((item) => item.currency),
          ...periodMovements.map((item) => item.currency),
          ...processingReceipts.map((item) => item.currency),
          ...pendingManualReceipts.map((item) => item.currency),
          ...pendingRefunds.map((item) => item.currency),
          ...failedReceipts.map((item) => item.currency),
          ...transferNotices.map((item) => item.invoice.currency),
        ]);
        if (
          ledgerCurrencies.size > 1 ||
          (ledgerCurrencies.size === 1 &&
            !ledgerCurrencies.has(profile.currency))
        ) {
          throw new ConflictException(
            "Finance records contain a currency mismatch and need review before reporting",
          );
        }

        const rows: FinanceReportRow[] = [];
        rows.push(
          ...invoices
            .filter((item) => BigInt(item.balance.outstandingMinor) > 0n)
            .map((item) => {
              const age = ageingBucket(item.dueAt, period.asOfDate);
              return financeReportRow({
                recordType: "receivables-ageing",
                reference: `INV-${item.invoiceNumber?.toString() ?? item.id}`,
                date: item.issuedAt?.toISOString() ?? null,
                payerName: item.payerNameSnapshot,
                status: item.status,
                amountMinor: item.totalMinor.toString(),
                currency: item.currency,
                description:
                  "Outstanding invoice; amount reflects issued credits and net confirmed allocations",
                dueDate: item.dueAt ? financeLocalDateKey(item.dueAt) : null,
                outstandingMinor: item.balance.outstandingMinor,
                ageingBucket: age.bucket,
                overdueDays: age.overdueDays,
              });
            }),
        );

        const receiptsRows = periodReceipts.map((receipt) => {
          const unapplied = receiptUnapplied(
            receipt.amountMinor,
            receipt.allocations,
            receipt.movements,
          );
          return financeReportRow({
            recordType: "receipts-allocation",
            reference: `RCT-${receipt.id}`,
            date: receipt.confirmedAt?.toISOString() ?? null,
            payerName: receipt.payerAccount?.displayName ?? null,
            status: "CONFIRMED",
            amountMinor: receipt.amountMinor.toString(),
            currency: receipt.currency,
            description: `${receipt.allocations.length} allocation(s); ${unapplied} minor units unapplied`,
          });
        });
        const allocationRows = periodAllocations.map((allocation) => {
          const reversed = sumMinorUnits(
            allocation.reversals.map((entry) => entry.amountMinor),
          );
          const net = netAllocationMinor(allocation.amountMinor, reversed);
          return financeReportRow({
            recordType: "receipts-allocation",
            reference: `INV-${allocation.invoice.invoiceNumber?.toString() ?? "pending"}`,
            date: allocation.createdAt.toISOString(),
            payerName: allocation.invoice.payerAccount?.displayName ?? null,
            status: reversed > 0n ? "PARTIALLY_REVERSED" : "ALLOCATED",
            amountMinor: net.toString(),
            currency: profile.currency,
            description: "Confirmed receipt allocation net of reversals",
          });
        });
        const exceptionRows = [
          ...processingReceipts.map((item) =>
            financeReportRow({
              recordType: "exceptions",
              reference: `RCT-${item.id}`,
              date: item.createdAt.toISOString(),
              payerName: item.payerAccount?.displayName ?? null,
              status: "PROCESSING",
              amountMinor: item.amountMinor.toString(),
              currency: item.currency,
              description: "Payment is processing; do not record as received",
            }),
          ),
          ...pendingManualReceipts.map((item) =>
            financeReportRow({
              recordType: "exceptions",
              reference: `MRR-${item.id}`,
              date: item.createdAt.toISOString(),
              payerName: item.payerAccount?.displayName ?? null,
              status: "PENDING_REVIEW",
              amountMinor: item.amountMinor.toString(),
              currency: item.currency,
              description: "Manual receipt request needs an independent review",
            }),
          ),
          ...pendingRefunds.map((item) =>
            financeReportRow({
              recordType: "exceptions",
              reference: `RFD-${item.id}`,
              date: item.createdAt.toISOString(),
              payerName: item.receipt.payerAccount?.displayName ?? null,
              status: item.status,
              amountMinor: item.amountMinor.toString(),
              currency: item.currency,
              description: "Refund requires review or provider follow-up",
            }),
          ),
          ...failedReceipts.map((item) =>
            financeReportRow({
              recordType: "exceptions",
              reference: `RCT-${item.id}`,
              date: item.createdAt.toISOString(),
              payerName: item.payerAccount?.displayName ?? null,
              status: "FAILED",
              amountMinor: item.amountMinor.toString(),
              currency: item.currency,
              description: "Payment failed; no debt reduction was posted",
            }),
          ),
          ...transferNotices.map((item) =>
            financeReportRow({
              recordType: "exceptions",
              reference: `TRN-${item.id}`,
              date: item.createdAt.toISOString(),
              payerName: item.payerAccount?.displayName ?? null,
              status: "UNMATCHED_TRANSFER_NOTICE",
              amountMinor: item.amountMinor.toString(),
              currency: item.invoice.currency,
              description: `Payer declaration only; invoice INV-${item.invoice.invoiceNumber?.toString() ?? "pending"} remains unpaid until confirmed`,
            }),
          ),
          ...confirmedReceipts
            .map((receipt) => ({
              receipt,
              unapplied: receiptUnapplied(
                receipt.amountMinor,
                receipt.allocations,
                receipt.movements,
              ),
            }))
            .filter(({ unapplied }) => BigInt(unapplied) > 0n)
            .map(({ receipt, unapplied }) =>
              financeReportRow({
                recordType: "exceptions",
                reference: `RCT-${receipt.id}`,
                date: receipt.confirmedAt?.toISOString() ?? null,
                payerName: receipt.payerAccount?.displayName ?? null,
                status: "UNAPPLIED_FUNDS",
                amountMinor: unapplied,
                currency: receipt.currency,
                description: "Confirmed receipt funds are not allocated",
              }),
            ),
        ];
        const externalRefundReviews = await loadFinanceExternalRefundReviews(
          tx,
          actor,
          period.asOfCutoff,
        );
        rows.push(
          ...externalRefundReviews.rows,
          ...receiptsRows,
          ...allocationRows,
          ...exceptionRows,
          ...(await loadFinanceWebhookExceptions(tx, actor, period.asOfCutoff)),
        );

        const totals = calculateFinanceReportTotals({
          externalRefundReviewAmounts: externalRefundReviews.amountsMinor,
          invoices,
          periodCredits,
          periodReceipts,
          periodMovements,
          periodAllocations,
          confirmedReceipts,
          processingReceipts,
          pendingManualReceipts,
          pendingRefunds,
          failedReceipts,
          transferNotices,
          period,
        });
        return {
          profile,
          connection: connection?.stripeAccountId
            ? {
                id: connection.id,
                accountId: connection.stripeAccountId,
                livemode: connection.livemode,
                collectionStatus: connection.status,
              }
            : null,
          rows,
          totals,
        };
      },
    );
    const metadata: FinanceReportMetadata = {
      from: filters.from,
      to: filters.to,
      asOfDate: filters.asOf,
      timeZone: "Europe/London",
      generatedAt: generatedAt.toISOString(),
      ledgerCutoffAt: period.asOfCutoff.toISOString(),
      currency: loaded.profile?.currency ?? null,
      legalEntityName: loaded.profile?.legalEntityName ?? null,
      reportingBasis:
        "Selected issue, confirmation, allocation and movement dates; balances use the stated Europe/London as-of date.",
    };
    return {
      metadata,
      totals: loaded.totals,
      rows: loaded.rows,
      connection: loaded.connection,
    };
  }
}

async function loadInvoiceBalances(
  tx: Prisma.TransactionClient,
  actor: FinanceRequestActor,
  balances: FinanceBalanceService,
  asOf: Date,
) {
  const items: FinanceReportInvoice[] = [];
  let cursor: string | undefined;
  while (true) {
    const batch = await tx.financeInvoice.findMany({
      where: {
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        status: { in: ["ISSUED", "VOID"] },
        issuedAt: { lte: asOf },
        createdAt: { lte: asOf },
      },
      orderBy: { id: "asc" },
      take: INVOICE_BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        currency: true,
        totalMinor: true,
        issuedAt: true,
        dueAt: true,
        voidedAt: true,
        createdAt: true,
        payerNameSnapshot: true,
      },
    });
    if (batch.length === 0) break;
    const mappedBalances = await balances.forInvoices(
      tx,
      actor,
      batch,
      asOf,
      asOf,
    );
    items.push(
      ...batch.map((invoice) => ({
        ...invoice,
        balance: {
          ...mappedBalances.get(invoice.id)!,
        },
      })),
    );
    cursor = batch[batch.length - 1]?.id;
    if (batch.length < INVOICE_BATCH_SIZE) break;
  }
  return items;
}
