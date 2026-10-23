import type { Prisma } from "@pathway/db";
import type { FinanceReconciliationObject } from "../stripe/finance-stripe-reconciliation.provider";
import type { FinanceConnectionScope } from "./finance-reconciliation.types";
import type { FinanceReconciliationPageSummary } from "./finance-reconciliation-runner";
import { projectFinancePaymentIntent } from "./finance-payment-intent-observation";
import { recoverFinanceProviderObservation } from "./finance-provider-observation.persistence";

export async function recoverFinancePaymentIntent(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
  object: FinanceReconciliationObject,
  now: Date,
  mode: "capture" | "dry-run",
): Promise<FinanceReconciliationPageSummary> {
  const observation = projectFinancePaymentIntent(scope, object);
  return recoverFinanceProviderObservation(
    tx,
    scope,
    observation ?? {
      eventType: "finance.reconciliation.payment_intent.invalid",
      object: { id: object.id, object: object.object, created: object.created },
      resourceReference: object.id,
      disposition: "hold",
      origin: { kind: "current-object" },
    },
    now,
    mode,
  );
}
