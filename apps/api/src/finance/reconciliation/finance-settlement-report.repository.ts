import { Injectable } from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import type { FinanceRequestActor } from "../finance-controller-support";
import type { FinanceReportFilters } from "../dto/finance-report.dto";
import { resolveFinanceReportPeriod } from "../finance-report-period";
import { projectFinanceSettlementReport } from "./finance-settlement-report.projection";
import type {
  FinanceSettlementReport,
  FinanceSettlementReportConnection,
} from "./finance-settlement-report.types";

const REPORT_LIMIT = 1000;

@Injectable()
export class FinanceSettlementReportRepository {
  async load(
    actor: FinanceRequestActor,
    connection: FinanceSettlementReportConnection | null,
    filters: FinanceReportFilters,
    generatedAt = new Date(),
  ): Promise<FinanceSettlementReport> {
    if (!connection) return emptySettlementReport("NOT_CONNECTED", null);
    const period = resolveFinanceReportPeriod(filters);
    const periodEnd = new Date(
      Math.min(
        period.periodEnd.getTime(),
        period.asOfCutoff.getTime() + 1,
        generatedAt.getTime(),
      ),
    );
    const from = Math.floor(period.periodStart.getTime() / 1000);
    const to = Math.floor(periodEnd.getTime() / 1000);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const stored = await tx.financeStripeConnection.findFirst({
        where: {
          id: connection.id,
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          stripeAccountId: connection.accountId,
          livemode: connection.livemode,
        },
        select: { id: true },
      });
      if (!stored) return emptySettlementReport("UNAVAILABLE", connection);
      const [balances, payouts, streams] = await Promise.all([
        tx.$queryRaw<{ facts: unknown; observedAt: Date }[]>`
          SELECT "facts", "observedAt" FROM (
            SELECT DISTINCT ON ("providerReference") "providerReference", "facts", "observedAt", "digest"
            FROM "FinanceSettlementEvidence"
            WHERE "stripeConnectionId" = ${connection.id} AND "tenantId" = ${actor.tenantId} AND "orgId" = ${actor.orgId}
              AND "stripeAccountId" = ${connection.accountId} AND "livemode" = ${connection.livemode}
              AND "resourceType" = 'balance_transaction' AND "observedAt" <= ${generatedAt}
              AND ("facts"->>'created')::bigint >= ${from} AND ("facts"->>'created')::bigint < ${to}
            ORDER BY "providerReference", "observedAt" DESC, "digest" DESC
          ) latest ORDER BY "providerReference" LIMIT ${REPORT_LIMIT + 1}
        `,
        tx.$queryRaw<
          { payoutFacts: unknown; coverage: unknown; updatedAt: Date }[]
        >`
          SELECT "payoutFacts", "coverage", "updatedAt" FROM "FinancePayoutReconciliation"
          WHERE "stripeConnectionId" = ${connection.id} AND "tenantId" = ${actor.tenantId} AND "orgId" = ${actor.orgId}
            AND "payoutFacts"->'livemode' = to_jsonb(${connection.livemode}::boolean) AND "updatedAt" <= ${generatedAt}
            AND ("payoutFacts"->>'created')::bigint >= ${from} AND ("payoutFacts"->>'created')::bigint < ${to}
          ORDER BY "payoutId" LIMIT ${REPORT_LIMIT + 1}
        `,
        tx.financeReconciliationState.findMany({
          where: {
            stripeConnectionId: connection.id,
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            stream: { in: ["balanceTransactions", "payouts"] },
          },
          select: {
            stream: true,
            completedThrough: true,
            lastSucceededAt: true,
            windowFrom: true,
            windowTo: true,
            lastError: true,
          },
        }),
      ]);
      return projectFinanceSettlementReport({
        connection,
        generatedAt,
        periodEnd,
        balanceEvidence: balances.slice(0, REPORT_LIMIT),
        payoutEvidence: payouts.slice(0, REPORT_LIMIT),
        streams,
        truncated:
          balances.length > REPORT_LIMIT || payouts.length > REPORT_LIMIT,
      });
    });
  }
}

export function emptySettlementReport(
  status: "NOT_CONNECTED" | "UNAVAILABLE",
  context: FinanceSettlementReportConnection | null,
): FinanceSettlementReport {
  return {
    status,
    source: "PERSISTED_RECONCILIATION",
    context,
    fetchedAt: null,
    freshness: "NOT_SYNCED",
    periodStartCoverage: "UNPROVEN",
    truncated: false,
    coverage: [],
    feesByCurrency: [],
    payouts: [],
  };
}
