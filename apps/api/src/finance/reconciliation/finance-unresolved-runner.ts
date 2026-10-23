import { withTenantRlsContext } from "@pathway/db";
import type { FinanceConnectionScope } from "./finance-reconciliation.types";
import type { FinanceReconciliationStateRepository } from "./finance-reconciliation-state.repository";
import {
  runFinanceRecoveryPages,
  type FinanceReconciliationRunResult,
} from "./finance-recovery-page-runner";
import { readFinanceUnresolvedPage } from "./finance-unresolved-operations.persistence";
import { readFinanceUnresolvedContext } from "./finance-unresolved-context.persistence";
import {
  prepareFinanceUnresolvedOperation,
  type FinanceUnresolvedProviders,
} from "./finance-unresolved-preparation";
import { captureFinanceUnresolvedOperation } from "./finance-unresolved-capture.persistence";

export interface FinanceUnresolvedDependencies extends FinanceUnresolvedProviders {
  states: Pick<
    FinanceReconciliationStateRepository,
    "preview" | "claim" | "commitPage" | "release" | "fail"
  >;
  clock(): Date;
}
/** One historical operation and at most one bounded search page per invocation. */
export async function runFinanceUnresolvedReconciliation(
  input: { scope: FinanceConnectionScope; mode: "sync" | "dry-run" },
  dependencies: FinanceUnresolvedDependencies,
): Promise<FinanceReconciliationRunResult> {
  const { scope } = input;
  const inScope = <T>(read: Parameters<typeof withTenantRlsContext<T>>[2]) =>
    withTenantRlsContext(scope.tenantId, scope.orgId, read);
  return runFinanceRecoveryPages(
    { ...input, stream: "unresolvedOperations" },
    {
      states: dependencies.states,
      clock: dependencies.clock,
      maxPages: 1,
      readPage: (window) =>
        inScope((tx) =>
          readFinanceUnresolvedPage(tx, scope, window.to, window.cursor, 1),
        ),
      preparePage: async (operations) => {
        const result = [];
        for (const operation of operations) {
          const context = await inScope((tx) =>
            readFinanceUnresolvedContext(tx, scope, operation),
          );
          result.push(
            await prepareFinanceUnresolvedOperation(
              scope,
              context,
              dependencies.clock(),
              input.mode,
              dependencies,
            ),
          );
        }
        return result;
      },
      handlePage: async (page) => {
        const capture = async (
          tx: Parameters<Parameters<typeof withTenantRlsContext>[2]>[0],
        ) => {
          const summary = { recoverable: 0, exceptions: 0 };
          for (const operation of page.objects) {
            const result = await captureFinanceUnresolvedOperation(
              tx,
              scope,
              operation,
              page.now,
              page.mode,
            );
            summary.recoverable += result.recoverable;
            summary.exceptions += result.exceptions;
          }
          return summary;
        };
        return page.mode === "capture" ? capture(page.tx) : inScope(capture);
      },
    },
  );
}
