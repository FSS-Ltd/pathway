import { withTenantRlsContext } from "@pathway/db";
import { StripeFinanceReconciliationProvider } from "../stripe/finance-stripe-reconciliation.provider";
import { StripeFinanceMandateServicingProvider } from "../stripe/finance-stripe-mandate-servicing.provider";
import { StripeFinancePayoutConstituentsProvider } from "../stripe/finance-stripe-payout-constituents.provider";
import type { FinanceStripeServicingConfig } from "../stripe/finance-stripe-servicing.config";
import { FinanceReconciliationStateRepository } from "./finance-reconciliation-state.repository";
import { loadFinanceRecoveryScope } from "./finance-recovery-scope.repository";
import type { FinanceRecoveryRequest } from "./finance-recovery.contracts";
import {
  runFinanceRecoveryPages,
  type FinanceReconciliationRunResult,
} from "./finance-recovery-page-runner";
import { prepareFinanceRecoveryPage } from "./finance-recovery-page-preparation";
import { captureFinanceRecoveryPage } from "./finance-recovery-page-capture";
import { readFinancePayoutContinuation } from "./finance-settlement.repository";
import { runFinanceUnresolvedReconciliation } from "./finance-unresolved-runner";
import { runFinancePayoutContinuationsReconciliation } from "./finance-payout-continuations.runner";
import { runFinanceCaseRequestsReconciliation } from "./finance-case-request.runner";
import { createFinanceCaseRecheckPreparation } from "./finance-case-recheck.preparation";

export type FinanceRecoveryResult =
  | FinanceReconciliationRunResult
  | {
      status: "disabled";
      mode: "sync" | "dry-run";
      pages: 0;
      objects: 0;
      recoverable: 0;
      exceptions: 0;
    };
interface Dependencies {
  states?: Pick<
    FinanceReconciliationStateRepository,
    "preview" | "claim" | "commitPage" | "release" | "fail"
  >;
  fetcher?: typeof fetch;
  clock?: () => Date;
  loadScope?: typeof loadFinanceRecoveryScope;
}

/** A single durable page. Provider I/O shares a twenty-second invocation budget. */
export async function runFinanceRecoveryRequest(
  input: FinanceRecoveryRequest,
  config: FinanceStripeServicingConfig,
  dependencies: Dependencies = {},
): Promise<FinanceRecoveryResult> {
  if (config.mode === "disabled")
    return {
      mode: input.mode,
      status: "disabled",
      pages: 0,
      objects: 0,
      recoverable: 0,
      exceptions: 0,
    };
  const scope = await (dependencies.loadScope ?? loadFinanceRecoveryScope)(
    input,
  );
  if (scope.livemode !== (config.mode === "live"))
    throw new Error(
      "Finance recovery environment does not match stored connection",
    );
  const deadline = AbortSignal.timeout(20_000);
  const originalFetch = dependencies.fetcher ?? fetch;
  const fetcher: typeof fetch = (url, options) =>
    originalFetch(url, {
      ...options,
      signal: options?.signal
        ? AbortSignal.any([deadline, options.signal])
        : deadline,
    });
  const provider = new StripeFinanceReconciliationProvider(
    config.secretKey,
    fetcher,
  );
  const mandates = new StripeFinanceMandateServicingProvider(config, fetcher);
  const payouts = new StripeFinancePayoutConstituentsProvider(
    config.secretKey,
    fetcher,
  );
  const states =
    dependencies.states ?? new FinanceReconciliationStateRepository();
  const clock = dependencies.clock ?? (() => new Date());
  const inScope = <T>(read: Parameters<typeof withTenantRlsContext<T>>[2]) =>
    withTenantRlsContext(scope.tenantId, scope.orgId, read);
  const operation = { scope, mode: input.mode };
  switch (input.stream) {
    case "unresolvedOperations":
      return runFinanceUnresolvedReconciliation(operation, {
        provider,
        mandates,
        states,
        clock,
      });
    case "payoutContinuations":
      return runFinancePayoutContinuationsReconciliation(operation, {
        provider,
        payouts,
        states,
        clock,
      });
    case "caseRequests":
      return runFinanceCaseRequestsReconciliation(operation, {
        states,
        clock,
        prepareRecheck: createFinanceCaseRecheckPreparation({
          provider,
          mandates,
          payouts,
          clock,
        }),
      });
    default: {
      const stream = input.stream;
      return runFinanceRecoveryPages(
        { ...operation, stream },
        {
          states,
          clock,
          maxPages: 1,
          readPage: (window) =>
            provider.listPage(scope, stream, {
              pageSize: stream === "payouts" ? 1 : 10,
              from: window.from,
              to: window.to,
              ...(window.cursor ? { startingAfter: window.cursor } : {}),
            }),
          preparePage: (objects) =>
            prepareFinanceRecoveryPage(
              scope,
              stream,
              objects,
              {
                provider,
                payouts,
                readPayoutContinuation: (id) =>
                  inScope((tx) => readFinancePayoutContinuation(tx, scope, id)),
              },
              clock(),
            ),
          handlePage: (page) =>
            page.mode === "capture"
              ? captureFinanceRecoveryPage(
                  page.tx,
                  scope,
                  stream,
                  page.objects,
                  page.now,
                  "capture",
                )
              : inScope((tx) =>
                  captureFinanceRecoveryPage(
                    tx,
                    scope,
                    stream,
                    page.objects,
                    page.now,
                    "dry-run",
                  ),
                ),
        },
      );
    }
  }
}
