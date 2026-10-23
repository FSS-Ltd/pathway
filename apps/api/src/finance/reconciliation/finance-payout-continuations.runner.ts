import { withTenantRlsContext } from "@pathway/db";
import type { FinanceConnectionScope } from "./finance-reconciliation.types";
import type { StripeFinanceReconciliationProvider } from "../stripe/finance-stripe-reconciliation.provider";
import type { FinanceReconciliationStateRepository } from "./finance-reconciliation-state.repository";
import {
  runFinanceRecoveryPages,
  type FinanceReconciliationRunResult,
} from "./finance-recovery-page-runner";
import {
  readFinanceUnresolvedPayoutPage,
  type FinanceUnresolvedPayout,
} from "./finance-settlement.repository";
import { captureFinanceSettlementObservation } from "./finance-settlement.persistence";
import {
  prepareFinancePayoutSettlement,
  type FinancePayoutConstituentsReader,
  type FinancePreparedPayoutSettlement,
} from "./finance-settlement-prepare";
import { projectFinancePayout } from "./finance-settlement.projection";
interface Providers {
  provider: Pick<StripeFinanceReconciliationProvider, "retrieve">;
  payouts: FinancePayoutConstituentsReader;
}
export interface FinancePreparedPayoutContinuation {
  payout: FinanceUnresolvedPayout["payout"];
  prepared: FinancePreparedPayoutSettlement;
}
export async function prepareFinancePayoutContinuation(
  scope: FinanceConnectionScope,
  stored: FinanceUnresolvedPayout,
  dependencies: Providers,
  observedAt: Date,
): Promise<FinancePreparedPayoutContinuation> {
  const previous = stored.coverage.status === "INCOMPLETE" ? stored : null;
  const payout =
    previous?.payout ??
    projectFinancePayout(
      scope,
      await dependencies.provider.retrieve(scope, "payouts", stored.payoutId),
    );
  const prepared = await prepareFinancePayoutSettlement(
    dependencies.payouts,
    scope,
    payout,
    {
      maxPages: 1,
      observedAt,
      ...(previous ? { previous: previous.coverage } : {}),
    },
  );
  return { payout, prepared };
}
export interface FinancePayoutContinuationDependencies extends Providers {
  states: Pick<
    FinanceReconciliationStateRepository,
    "preview" | "claim" | "commitPage" | "release" | "fail"
  >;
  clock(): Date;
}
export async function runFinancePayoutContinuationsReconciliation(
  input: { scope: FinanceConnectionScope; mode: "sync" | "dry-run" },
  dependencies: FinancePayoutContinuationDependencies,
): Promise<FinanceReconciliationRunResult> {
  const { scope } = input;
  return runFinanceRecoveryPages(
    { ...input, stream: "payoutContinuations" },
    {
      states: dependencies.states,
      clock: dependencies.clock,
      maxPages: 1,
      readPage: (window) =>
        withTenantRlsContext(scope.tenantId, scope.orgId, (tx) =>
          readFinanceUnresolvedPayoutPage(
            tx,
            scope,
            window.to,
            window.cursor,
            1,
          ),
        ),
      preparePage: async (payouts) => {
        const result: FinancePreparedPayoutContinuation[] = [];
        for (const payout of payouts)
          result.push(
            await prepareFinancePayoutContinuation(
              scope,
              payout,
              dependencies,
              dependencies.clock(),
            ),
          );
        return result;
      },
      handlePage: async (page) => {
        const capture = async (
          tx: Parameters<Parameters<typeof withTenantRlsContext>[2]>[0],
        ) => {
          const summary = { recoverable: 0, exceptions: 0 };
          for (const item of page.objects) {
            const result = await captureFinanceSettlementObservation(
              tx,
              scope,
              "payouts",
              item.payout,
              page.now,
              item.prepared,
              page.mode,
            );
            summary.recoverable += result.recoverable;
            summary.exceptions += result.exceptions;
          }
          return summary;
        };
        return page.mode === "capture"
          ? capture(page.tx)
          : withTenantRlsContext(scope.tenantId, scope.orgId, capture);
      },
    },
  );
}
