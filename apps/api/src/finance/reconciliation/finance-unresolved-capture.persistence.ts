import type { Prisma } from "@pathway/db";
import type { FinanceConnectionScope } from "./finance-reconciliation.types";
import type { FinancePreparedUnresolved } from "./finance-unresolved-preparation";
import type { FinanceReconciliationPageSummary } from "./finance-recovery-page-runner";
import { recoverFinanceCheckout } from "./finance-checkout-recovery.persistence";
import { recoverFinancePaymentIntent } from "./finance-payment-intent-recovery.persistence";
import { recoverFinanceReversal } from "./finance-reversal-recovery.persistence";
import { recoverFinanceMandateObject } from "./finance-mandate-recovery.persistence";
import {
  detectReconciliationCase,
  resolveReconciliationCase,
} from "./finance-reconciliation-case.persistence";
import { assertReconciliationScope } from "./finance-reconciliation-scope";

export async function captureFinanceUnresolvedOperation(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
  prepared: FinancePreparedUnresolved,
  now: Date,
  mode: "capture" | "dry-run",
): Promise<FinanceReconciliationPageSummary> {
  await assertReconciliationScope(tx, scope);
  const { context, objects, mandateObjects, search } = prepared;
  const { operation, mandate } = context;
  const summary = { recoverable: 0, exceptions: 0 };
  for (const object of objects) {
    const result =
      operation.kind === "checkout"
        ? await recoverFinanceCheckout(tx, scope, object, now, mode)
        : operation.kind === "debit"
          ? await recoverFinancePaymentIntent(tx, scope, object, now, mode)
          : await recoverFinanceReversal(
              tx,
              scope,
              operation.kind === "refund" ? "refunds" : "disputes",
              object,
              now,
              mode,
            );
    summary.recoverable += result.recoverable;
    summary.exceptions += result.exceptions;
  }
  for (const object of mandateObjects) {
    const result = await recoverFinanceMandateObject(
      tx,
      scope,
      object,
      now,
      mode,
    );
    summary.recoverable += result.recoverable;
    summary.exceptions += result.exceptions;
  }
  if (mode === "capture" && prepared.cancellationAcknowledged && mandate) {
    await tx.financeMandate.updateMany({
      where: {
        id: mandate.id,
        tenantId: scope.tenantId,
        orgId: scope.orgId,
        stripeConnectionId: scope.connectionId,
        stripeAccountId: scope.stripeAccountId,
        livemode: scope.livemode,
        status: "CANCELLED",
        providerCancellationPending: true,
        stripeSetupIntentId: mandate.stripeSetupIntentId,
        stripeCheckoutSessionId: mandate.stripeCheckoutSessionId,
        stripePaymentMethodId: mandate.stripePaymentMethodId,
        stripeMandateId: mandate.stripeMandateId,
        stripeCustomer: {
          stripeCustomerId: mandate.stripeCustomer.stripeCustomerId,
        },
      },
      data: { providerCancellationPending: false },
    });
  }
  const identified =
    objects.length + mandateObjects.length > 0 && summary.exceptions === 0;
  const key = `unresolved:${operation.key}`;
  if (!identified || (search && !search.exhausted)) {
    summary.exceptions++;
    if (mode === "capture")
      await detectReconciliationCase(
        tx,
        scope,
        {
          key,
          kind: "UNKNOWN_OPERATION",
          ...(operation.resourceId
            ? { resourceReference: operation.resourceId }
            : {}),
          details: {
            reason:
              prepared.issue ??
              (search?.exhausted
                ? "PROVIDER_SEARCH_EXHAUSTED_OUTCOME_UNKNOWN"
                : context.attemptedAt
                  ? "PROVIDER_OPERATION_UNRESOLVED"
                  : "PROVIDER_ATTEMPT_NOT_RECORDED"),
            operationKey: operation.key,
            ...(search ? { search } : {}),
          },
        },
        now,
      );
  } else if (mode === "capture")
    await resolveReconciliationCase(
      tx,
      scope,
      key,
      now,
      "provider_operation_identified",
    );
  return summary;
}
