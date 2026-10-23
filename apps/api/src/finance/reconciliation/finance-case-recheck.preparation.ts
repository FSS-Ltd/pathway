import { withTenantRlsContext } from "@pathway/db";
import { assertReconciliationScope } from "./finance-reconciliation-scope";
import type { FinanceConnectionScope } from "./finance-reconciliation.types";
import type { FinanceReconciliationStream } from "../stripe/finance-stripe-reconciliation.provider";
import type {
  PrepareFinanceCaseRecheck,
  PreparedFinanceCaseRecheck,
} from "./finance-case-request.contracts";
import { readFinanceCaseUnresolvedContext } from "./finance-case-unresolved.persistence";
import {
  prepareFinanceUnresolvedOperation,
  type FinanceUnresolvedProviders,
} from "./finance-unresolved-preparation";
import { captureFinanceUnresolvedOperation } from "./finance-unresolved-capture.persistence";
import { prepareFinanceRecoveryPage } from "./finance-recovery-page-preparation";
import { captureFinanceRecoveryPage } from "./finance-recovery-page-capture";
import { readFinancePayoutContinuation } from "./finance-settlement.repository";
import type { FinancePayoutConstituentsReader } from "./finance-settlement-prepare";
import { recoverFinanceMandateObject } from "./finance-mandate-recovery.persistence";

export interface FinanceCaseRecheckPreparationDependencies extends FinanceUnresolvedProviders {
  payouts: FinancePayoutConstituentsReader;
  clock(): Date;
}
function assertSameScope(
  expected: FinanceConnectionScope,
  actual: FinanceConnectionScope,
): void {
  if (
    expected.tenantId !== actual.tenantId ||
    expected.orgId !== actual.orgId ||
    expected.connectionId !== actual.connectionId ||
    expected.stripeAccountId !== actual.stripeAccountId ||
    expected.livemode !== actual.livemode
  )
    throw new Error("Case recheck capture scope changed");
}
function manual(
  scope: FinanceConnectionScope,
  reason: string,
): PreparedFinanceCaseRecheck {
  return {
    outcome: `MANUAL_REVIEW_REQUIRED_${reason}`,
    async capture(_tx, actual) {
      assertSameScope(scope, actual);
      return { recoverable: 0, exceptions: 1 };
    },
  };
}
function providerStream(reference: string): FinanceReconciliationStream | null {
  if (reference.length > 255) return null;
  const resources: [RegExp, FinanceReconciliationStream][] = [
    [/^evt_[A-Za-z0-9_]+$/, "events"],
    [/^cs_[A-Za-z0-9_]+$/, "checkoutSessions"],
    [/^pi_[A-Za-z0-9_]+$/, "paymentIntents"],
    [/^seti_[A-Za-z0-9_]+$/, "setupIntents"],
    [/^(?:ch|py)_[A-Za-z0-9_]+$/, "charges"],
    [/^re_[A-Za-z0-9_]+$/, "refunds"],
    [/^du_[A-Za-z0-9_]+$/, "disputes"],
    [/^txn_[A-Za-z0-9_]+$/, "balanceTransactions"],
    [/^po_[A-Za-z0-9_]+$/, "payouts"],
  ];
  return resources.find(([pattern]) => pattern.test(reference))?.[1] ?? null;
}
/** Prepare reads only. A captured case recheck never submits a cancellation or money instruction. */
export function createFinanceCaseRecheckPreparation(
  dependencies: FinanceCaseRecheckPreparationDependencies,
): PrepareFinanceCaseRecheck {
  return async (scope, request) => {
    if (request.action !== "RECHECK") return manual(scope, "ACTION");
    const now = dependencies.clock();
    const inScope = <T>(read: Parameters<typeof withTenantRlsContext<T>>[2]) =>
      withTenantRlsContext(scope.tenantId, scope.orgId, read);
    await inScope((tx) => assertReconciliationScope(tx, scope));
    if (/^(?:unresolved:|operation:)/.test(request.caseKey)) {
      const context = await inScope((tx) =>
        readFinanceCaseUnresolvedContext(tx, scope, request.caseKey),
      );
      if (!context) return manual(scope, "LOCAL_REFERENCE");
      const prepared = await prepareFinanceUnresolvedOperation(
        scope,
        context,
        now,
        "dry-run",
        dependencies,
      );
      return {
        outcome: "OPERATION_RECHECK_INSPECTED",
        async capture(tx, actual, observedAt, mode) {
          assertSameScope(scope, actual);
          return captureFinanceUnresolvedOperation(
            tx,
            scope,
            prepared,
            observedAt,
            mode === "sync" ? "capture" : "dry-run",
          );
        },
      };
    }
    const reference = request.resourceReference;
    if (!reference) return manual(scope, "NO_RESOURCE");
    if (
      /^(?:mandate|pm)_[A-Za-z0-9_]+$/.test(reference) &&
      reference.length <= 255
    ) {
      const object = await dependencies.mandates.retrieve(
        scope,
        reference.startsWith("pm_") ? "paymentMethods" : "mandates",
        reference,
      );
      return {
        outcome: "MANDATE_RECHECK_INSPECTED",
        async capture(tx, actual, observedAt, mode) {
          assertSameScope(scope, actual);
          return recoverFinanceMandateObject(
            tx,
            scope,
            object,
            observedAt,
            mode === "sync" ? "capture" : "dry-run",
          );
        },
      };
    }
    const stream = providerStream(reference);
    if (!stream) return manual(scope, "UNSUPPORTED_RESOURCE");
    const raw = await dependencies.provider.retrieve(scope, stream, reference);
    const prepared = await prepareFinanceRecoveryPage(
      scope,
      stream,
      [raw],
      {
        provider: dependencies.provider,
        payouts: dependencies.payouts,
        readPayoutContinuation: (id) =>
          inScope((tx) => readFinancePayoutContinuation(tx, scope, id)),
      },
      now,
    );
    return {
      outcome: "PROVIDER_RECHECK_INSPECTED",
      async capture(tx, actual, observedAt, mode) {
        assertSameScope(scope, actual);
        return captureFinanceRecoveryPage(
          tx,
          scope,
          stream,
          prepared,
          observedAt,
          mode === "sync" ? "capture" : "dry-run",
        );
      },
    };
  };
}
