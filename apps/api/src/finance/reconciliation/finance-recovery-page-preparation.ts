import type {
  FinanceReconciliationObject,
  FinanceReconciliationScope,
  FinanceReconciliationStream,
  StripeFinanceReconciliationProvider,
} from "../stripe/finance-stripe-reconciliation.provider";
import {
  parseFinanceMandateServicingObject,
  type FinanceMandateServicingObject,
} from "../stripe/finance-stripe-mandate-servicing.contracts";
import {
  prepareFinancePayoutSettlement,
  type FinancePreparedPayoutSettlement,
  type FinancePayoutConstituentsReader,
} from "./finance-settlement-prepare";
import { projectFinancePayout } from "./finance-settlement.projection";
import { prepareFinanceReconciliationObjects } from "./finance-reconciliation-prepare";
import type { FinanceUnresolvedPayout } from "./finance-settlement.persistence";

export type FinancePreparedRecoveryObject =
  | { kind: "ordinary"; raw: FinanceReconciliationObject }
  | { kind: "mandate"; mandate: FinanceMandateServicingObject }
  | {
      kind: "payout";
      raw: FinanceReconciliationObject;
      payout: FinancePreparedPayoutSettlement;
    };
export interface FinanceRecoveryPreparationDependencies {
  provider: Pick<StripeFinanceReconciliationProvider, "retrieve">;
  payouts: FinancePayoutConstituentsReader;
  readPayoutContinuation(
    payoutId: string,
  ): Promise<FinanceUnresolvedPayout | null>;
}
export async function prepareFinanceRecoveryPage(
  scope: FinanceReconciliationScope,
  stream: FinanceReconciliationStream,
  objects: FinanceReconciliationObject[],
  dependencies: FinanceRecoveryPreparationDependencies,
  observedAt: Date,
): Promise<FinancePreparedRecoveryObject[]> {
  const enriched = await prepareFinanceReconciliationObjects(
    scope,
    stream,
    objects,
    dependencies.provider,
  );
  const result: FinancePreparedRecoveryObject[] = [];
  for (const raw of enriched) {
    if (stream === "setupIntents") {
      result.push({
        kind: "mandate",
        mandate: parseFinanceMandateServicingObject(
          scope,
          "setupIntents",
          raw.id,
          raw,
        ),
      });
    } else if (stream === "payouts") {
      const stored = await dependencies.readPayoutContinuation(raw.id);
      const previous = stored?.coverage.status === "INCOMPLETE" ? stored : null;
      const payout = previous?.payout ?? projectFinancePayout(scope, raw);
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
      result.push({ kind: "payout", raw: { ...payout }, payout: prepared });
    } else result.push({ kind: "ordinary", raw });
  }
  return result;
}
