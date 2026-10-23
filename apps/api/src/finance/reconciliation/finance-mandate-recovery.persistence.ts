import type { Prisma } from "@pathway/db";
import type { FinanceMandateServicingObject } from "../stripe/finance-stripe-mandate-servicing.contracts";
import type { FinanceConnectionScope } from "./finance-reconciliation.types";
import type { FinanceReconciliationPageSummary } from "./finance-reconciliation-runner";
import { projectFinanceMandateObservation } from "./finance-mandate-observation";
import { recoverFinanceProviderObservation } from "./finance-provider-observation.persistence";

export async function recoverFinanceMandateObject(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
  object: FinanceMandateServicingObject,
  now: Date,
  mode: "capture" | "dry-run",
): Promise<FinanceReconciliationPageSummary> {
  return recoverFinanceProviderObservation(
    tx,
    scope,
    {
      ...projectFinanceMandateObservation(scope.livemode, object),
      origin: { kind: "current-object" },
    },
    now,
    mode,
  );
}
