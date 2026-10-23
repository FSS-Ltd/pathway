import { Inject, Injectable } from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { FinanceAccessService } from "./access/finance-access.service";
import type { FinanceRequestActor } from "./finance-controller-support";
import type {
  FinanceReportFilters,
  FinanceReportType,
} from "./dto/finance-report.dto";
import { financeReportRow } from "./finance-report-projection";
import {
  financeReportCsv,
  financeReportFilename,
  type CsvColumn,
} from "./finance-report-csv";
import {
  FINANCE_STRIPE_SERVICING_CONFIG,
  type FinanceStripeServicingConfig,
} from "./stripe/finance-stripe-servicing.config";
import type {
  FinanceReportRow,
  FinanceReportSnapshot,
} from "./finance-report.types";
import { FinanceReportRepository } from "./finance-report.repository";
import {
  FinanceSettlementReportRepository,
  emptySettlementReport,
} from "./reconciliation/finance-settlement-report.repository";
import type { FinanceSettlementReport } from "./reconciliation/finance-settlement-report.types";

const reportColumns: readonly CsvColumn<FinanceReportRow>[] = [
  { header: "Record type", value: (row) => row.recordType },
  { header: "Reference", value: (row) => row.reference },
  { header: "Date", value: (row) => row.date },
  { header: "Payer", value: (row) => row.payerName },
  { header: "Status", value: (row) => row.status },
  { header: "Amount minor units", value: (row) => row.amountMinor },
  { header: "Currency", value: (row) => row.currency },
  { header: "Description", value: (row) => row.description },
  { header: "Due date", value: (row) => row.dueDate },
  { header: "Outstanding minor units", value: (row) => row.outstandingMinor },
  { header: "Ageing bucket", value: (row) => row.ageingBucket },
  { header: "Overdue days", value: (row) => row.overdueDays },
  { header: "Processor fee minor units", value: (row) => row.feeMinor },
  { header: "Payout status", value: (row) => row.payoutStatus },
];

@Injectable()
export class FinanceReportService {
  constructor(
    @Inject(FinanceAccessService)
    private readonly access: FinanceAccessService,
    @Inject(FinanceReportRepository)
    private readonly repository: FinanceReportRepository,
    @Inject(FINANCE_STRIPE_SERVICING_CONFIG)
    private readonly stripeConfig: FinanceStripeServicingConfig,
    @Inject(FinanceSettlementReportRepository)
    private readonly settlementReports: FinanceSettlementReportRepository,
  ) {}

  async summary(actor: FinanceRequestActor, filters: FinanceReportFilters) {
    await this.access.assertStaffAction(actor, "READ_RECORDS");
    const snapshot = await this.repository.loadSnapshot(actor, filters);
    const provider = await this.providerReport(actor, snapshot, filters);
    return {
      metadata: snapshot.metadata,
      totals: snapshot.totals,
      provider,
      accessMode: await this.access.resolveMode(actor),
    };
  }

  async report(
    actor: FinanceRequestActor,
    type: FinanceReportType,
    filters: FinanceReportFilters,
  ) {
    await this.access.assertStaffAction(actor, "READ_RECORDS");
    const snapshot = await this.repository.loadSnapshot(actor, filters);
    if (type !== "payout-reconciliation") {
      return {
        type,
        metadata: {
          ...snapshot.metadata,
          reportingBasis: reportBasis(type),
        },
        totals: snapshot.totals,
        rows: snapshot.rows.filter((row) => row.recordType === type),
      };
    }
    const provider = await this.providerReport(actor, snapshot, filters);
    return {
      type,
      metadata: {
        ...snapshot.metadata,
        reportingBasis: reportBasis(type),
      },
      totals: snapshot.totals,
      provider: {
        status: provider.status,
        fetchedAt: provider.fetchedAt,
        feesByCurrency: provider.feesByCurrency,
        source: provider.source,
        context: provider.context,
        freshness: provider.freshness,
        periodStartCoverage: provider.periodStartCoverage,
        truncated: provider.truncated,
        coverage: provider.coverage,
      },
      rows: [
        ...provider.payouts.map(
          (payout) =>
            ({
              recordType: "payout",
              reference: payout.id,
              date: payout.createdAt,
              payerName: null,
              status: payout.reconciliationStatus,
              amountMinor: payout.amountMinor,
              currency: payout.currency,
              description: `Saved payout evidence; ${payout.complete ? "constituent pagination complete" : "constituent comparison incomplete or unsupported"}. Net ${payout.netMinor} ${payout.currency} minor units.`,
              dueDate: null,
              outstandingMinor: null,
              ageingBucket: null,
              overdueDays: null,
              feeMinor: null,
              payoutStatus: payout.status,
            }) satisfies FinanceReportRow,
        ),
        ...provider.feesByCurrency.map((fee) =>
          financeReportRow({
            recordType: "processor-fee",
            reference: `FEE-${fee.currency}-${filters.from}-${filters.to}`,
            date: provider.fetchedAt,
            status: "OBSERVED",
            currency: fee.currency,
            description:
              "Saved Stripe processor fee evidence for the selected period; coverage may be incomplete",
            feeMinor: fee.amountMinor,
          }),
        ),
      ],
    };
  }

  async exportCsv(
    actor: FinanceRequestActor,
    type: FinanceReportType,
    filters: FinanceReportFilters,
  ): Promise<{ filename: string; csv: string }> {
    await this.access.assertStaffAction(actor, "EXPORT_REPORT");
    const data = await this.report(actor, type, filters);
    const contextColumns: readonly CsvColumn<typeof data.metadata>[] = [
      { header: "From", value: (row) => row.from },
      { header: "To", value: (row) => row.to },
      { header: "As of", value: (row) => row.asOfDate },
      { header: "Timezone", value: (row) => row.timeZone },
      { header: "Generated at", value: (row) => row.generatedAt },
      { header: "Ledger cutoff", value: (row) => row.ledgerCutoffAt },
      { header: "Legal entity", value: (row) => row.legalEntityName },
      { header: "Currency", value: (row) => row.currency },
      { header: "Report basis", value: (row) => row.reportingBasis },
    ];
    const provider = "provider" in data ? data.provider : null;
    const settlementContext = provider
      ? financeReportCsv({
          columns: [
            { header: "Settlement source", value: (row) => row.source },
            {
              header: "Stripe account",
              value: (row) => row.context?.accountId ?? null,
            },
            {
              header: "Stripe environment",
              value: (row) =>
                row.context ? (row.context.livemode ? "live" : "test") : null,
            },
            { header: "Evidence observed at", value: (row) => row.fetchedAt },
            { header: "Evidence freshness", value: (row) => row.freshness },
            {
              header: "Historical start coverage",
              value: (row) => row.periodStartCoverage,
            },
            { header: "Truncated", value: (row) => String(row.truncated) },
            {
              header: "Stream cutoffs",
              value: (row) =>
                row.coverage
                  .map(
                    (stream) =>
                      `${stream.stream}: ${stream.completedThrough ?? "unknown"}`,
                  )
                  .join("; "),
            },
          ],
          rows: [provider],
        })
      : null;
    const csv = [
      financeReportCsv({ columns: contextColumns, rows: [data.metadata] }),
      "",
      ...(settlementContext ? [settlementContext, ""] : []),
      financeReportCsv({ columns: reportColumns, rows: data.rows }),
    ].join("\r\n");
    await withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await recordAuditEventInTransaction(tx, {
        actorUserId: actor.userId,
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        entityType: AuditEntityType.FINANCE_REPORT,
        action: AuditAction.EXPORTED,
        metadata: {
          reportType: type,
          filters: {
            from: filters.from,
            to: filters.to,
            asOf: filters.asOf,
            timeZone: "Europe/London",
          },
          rowCount: data.rows.length,
        },
      });
    });
    return {
      filename: financeReportFilename(type, filters.from, filters.to),
      csv,
    };
  }

  private async providerReport(
    actor: FinanceRequestActor,
    snapshot: FinanceReportSnapshot,
    filters: FinanceReportFilters,
  ): Promise<FinanceSettlementReport> {
    const connection = snapshot.connection;
    if (!connection) return emptySettlementReport("NOT_CONNECTED", null);
    if (
      this.stripeConfig.mode !== "disabled" &&
      (this.stripeConfig.mode === "live") !== connection.livemode
    )
      return emptySettlementReport("UNAVAILABLE", connection);
    const report = await this.settlementReports.load(
      actor,
      connection,
      filters,
    );
    return this.stripeConfig.mode === "disabled" ||
      connection.collectionStatus !== "READY"
      ? { ...report, status: "UNAVAILABLE" }
      : report;
  }
}

function reportBasis(type: FinanceReportType): string {
  switch (type) {
    case "receivables-ageing":
      return "Open issued invoice balances as of the stated Europe/London date; credits and confirmed net allocations reduce each invoice balance.";
    case "receipts-allocation":
      return "Confirmed receipts by confirmation date and allocations by allocation date, net of allocation reversals recorded by the ledger cutoff.";
    case "exceptions":
      return "Open processing, review, failed, unmatched and unapplied items as of the ledger cutoff.";
    case "payout-reconciliation":
      return "Saved connected-account payout and fee evidence for the selected period; amounts remain grouped by provider currency. Stream cutoffs and freshness describe saved observations. Earliest historical coverage is unproven.";
  }
}
