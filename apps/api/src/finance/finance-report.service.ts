import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
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
import { resolveFinanceReportPeriod } from "./finance-report-period";
import {
  FINANCE_STRIPE_CONNECT_CONFIG,
  type FinanceStripeConnectConfig,
} from "./stripe/finance-stripe-connect.config";
import {
  FINANCE_STRIPE_REPORTING_PROVIDER,
  type FinanceStripeReportingClient,
  type StripeFinanceReportingResult,
} from "./stripe/finance-stripe-reporting.provider";
import type {
  FinanceReportRow,
  FinanceReportSnapshot,
} from "./finance-report.types";
import { FinanceReportRepository } from "./finance-report.repository";

type ProviderReport = {
  status: "CONNECTED" | "NOT_CONNECTED" | "UNAVAILABLE";
  fetchedAt: string | null;
  feesByCurrency: StripeFinanceReportingResult["feesByCurrency"];
  payouts: StripeFinanceReportingResult["payouts"];
};

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
    @Inject(FINANCE_STRIPE_CONNECT_CONFIG)
    private readonly stripeConfig: FinanceStripeConnectConfig,
    @Inject(FINANCE_STRIPE_REPORTING_PROVIDER)
    private readonly stripeReports: FinanceStripeReportingClient,
  ) {}

  async summary(actor: FinanceRequestActor, filters: FinanceReportFilters) {
    await this.access.assertStaffAction(actor, "READ_RECORDS");
    const snapshot = await this.repository.loadSnapshot(actor, filters);
    const provider = await this.providerReport(snapshot, filters);
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
    const provider = await this.providerReport(snapshot, filters);
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
      },
      rows: [
        ...provider.payouts.map(
          (payout) =>
            ({
              recordType: "payout",
              reference: payout.id,
              date: payout.createdAt,
              payerName: null,
              status: payout.status,
              amountMinor: payout.amountMinor,
              currency: payout.currency,
              description: payout.arrivalAt
                ? `Expected arrival ${payout.arrivalAt}`
                : "Stripe connected-account payout",
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
            status: "RECONCILED",
            currency: fee.currency,
            description: "Stripe processor fees for the selected period",
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
    const csv = [
      financeReportCsv({ columns: contextColumns, rows: [data.metadata] }),
      "",
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
    snapshot: FinanceReportSnapshot,
    filters: FinanceReportFilters,
  ): Promise<ProviderReport> {
    const connection = snapshot.connection;
    if (!connection || this.stripeConfig.mode === "disabled") {
      return {
        status: "NOT_CONNECTED",
        fetchedAt: null,
        feesByCurrency: [],
        payouts: [],
      };
    }
    if ((this.stripeConfig.mode === "live") !== connection.livemode) {
      return {
        status: "UNAVAILABLE",
        fetchedAt: null,
        feesByCurrency: [],
        payouts: [],
      };
    }
    const period = resolveFinanceReportPeriod(filters);
    try {
      const data = await this.stripeReports.listReportActivity(
        connection.accountId,
        {
          from: period.periodStart,
          to: period.periodEnd,
        },
      );
      return { status: "CONNECTED", ...data };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        return {
          status: "UNAVAILABLE",
          fetchedAt: null,
          feesByCurrency: [],
          payouts: [],
        };
      }
      throw error;
    }
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
      return "Connected-account payout and fee evidence fetched from Stripe for the selected period; amounts remain grouped by provider currency.";
  }
}
