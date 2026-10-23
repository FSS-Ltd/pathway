import {
  recoverFinanceProviderObservation,
  financeObservationCaseKey,
} from "./finance-provider-observation.persistence";
import type { Prisma } from "@pathway/db";
import type { FinanceReconciliationObject } from "../stripe/finance-stripe-reconciliation.provider";
import type { FinanceConnectionScope } from "./finance-reconciliation.types";
import type { FinanceReconciliationPageSummary } from "./finance-reconciliation-runner";
import { isFinanceStripeCheckoutEventType } from "../stripe/finance-stripe-checkout-events";
import { projectFinanceProviderEvent } from "./finance-provider-event.projection";
import { projectFinanceCheckout } from "./finance-checkout-recovery.contracts";
import { recoverFinanceCheckout } from "./finance-checkout-recovery.persistence";
import {
  makeFinanceApiEvidence,
  captureFinanceApiEvidence,
} from "./finance-api-evidence.persistence";
import { detectReconciliationCase } from "./finance-reconciliation-case.persistence";

/** Caller checks the stored connection scope; this function performs no provider I/O. */
export async function recoverFinanceProviderEvent(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
  event: FinanceReconciliationObject,
  now: Date,
  mode: "capture" | "dry-run",
): Promise<FinanceReconciliationPageSummary> {
  const projected = projectFinanceProviderEvent(scope, event);
  if (!projected) {
    if (mode === "capture") {
      const evidence = makeFinanceApiEvidence(
        scope,
        "finance.reconciliation.event.invalid",
        { id: event.id, object: event.object, created: event.created },
        now,
      );
      await captureFinanceApiEvidence(tx, scope, evidence, "hold", now);
      await detectReconciliationCase(
        tx,
        scope,
        {
          key: financeObservationCaseKey(event.id, "invalid"),
          kind: "COVERAGE_GAP",
          resourceReference: event.id,
          details: {
            reason: "INVALID_PROVIDER_EVENT",
            evidenceEventId: evidence.eventId,
          },
        },
        now,
      );
    }
    return { recoverable: 0, exceptions: 1 };
  }
  if (
    isFinanceStripeCheckoutEventType(projected.eventType) &&
    projected.disposition === "queue"
  ) {
    const checkout = projectFinanceCheckout(projected.object);
    if (!checkout)
      throw new Error("Recovered Checkout projection is inconsistent");
    return recoverFinanceCheckout(tx, scope, { ...checkout }, now, mode, {
      id: projected.id,
      created: projected.created,
      eventType: projected.eventType,
    });
  }

  return recoverFinanceProviderObservation(
    tx,
    scope,
    {
      ...projected,
      resourceReference:
        typeof projected.object.id === "string"
          ? projected.object.id
          : projected.id,
      origin: {
        kind: "provider-event",
        id: projected.id,
        created: projected.created,
      },
    },
    now,
    mode,
  );
}
