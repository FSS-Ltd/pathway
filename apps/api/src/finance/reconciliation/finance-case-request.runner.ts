import { withTenantRlsContext } from "@pathway/db";
import type { FinanceConnectionScope } from "./finance-reconciliation.types";
import {
  runFinanceRecoveryPages,
  type FinanceRecoveryPageDependencies,
  type FinanceReconciliationRunResult,
} from "./finance-recovery-page-runner";
import type {
  FinanceCaseRequest,
  PrepareFinanceCaseRecheck,
  PreparedFinanceCaseRecheck,
} from "./finance-case-request.contracts";
import {
  completeFinanceCaseRequest,
  inspectFinanceCaseEvidence,
  lockPendingFinanceCaseRequest,
  readPendingFinanceCaseRequests,
  requeueFinanceCaseEvidence,
} from "./finance-case-request.persistence";

type PreparedRequest = {
  request: FinanceCaseRequest;
  recheck: PreparedFinanceCaseRecheck | null;
};
export interface FinanceCaseRequestDependencies {
  states: FinanceRecoveryPageDependencies<
    FinanceCaseRequest,
    PreparedRequest
  >["states"];
  clock(): Date;
  prepareRecheck: PrepareFinanceCaseRecheck;
}

export async function runFinanceCaseRequestsReconciliation(
  input: { scope: FinanceConnectionScope; mode: "sync" | "dry-run" },
  dependencies: FinanceCaseRequestDependencies,
): Promise<FinanceReconciliationRunResult> {
  const { scope } = input;
  return runFinanceRecoveryPages(
    { ...input, stream: "caseRequests" },
    {
      states: dependencies.states,
      clock: dependencies.clock,
      maxPages: 1,
      readPage: (window) =>
        withTenantRlsContext(scope.tenantId, scope.orgId, (tx) =>
          readPendingFinanceCaseRequests(tx, scope, window.to, window.cursor),
        ),
      preparePage: async (requests) => {
        const prepared: PreparedRequest[] = [];
        for (const request of requests)
          prepared.push({
            request,
            recheck:
              request.action === "RECHECK"
                ? await dependencies.prepareRecheck(scope, request)
                : null,
          });
        return prepared;
      },
      handlePage: async (page) => {
        let recoverable = 0;
        let exceptions = 0;
        for (const { request, recheck } of page.objects) {
          if (page.mode === "dry-run") {
            if (recheck) {
              const summary = await withTenantRlsContext(
                scope.tenantId,
                scope.orgId,
                (tx) => recheck.capture(tx, scope, page.now, "dry-run"),
              );
              recoverable += summary.recoverable;
              exceptions += summary.exceptions;
            } else {
              await withTenantRlsContext(scope.tenantId, scope.orgId, (tx) =>
                inspectFinanceCaseEvidence(tx, scope, request),
              );
              recoverable++;
            }
            continue;
          }
          if (!(await lockPendingFinanceCaseRequest(page.tx, scope, request)))
            continue;
          if (request.action === "REPLAY") {
            const audit = await requeueFinanceCaseEvidence(
              page.tx,
              scope,
              request,
              page.now,
            );
            await completeFinanceCaseRequest(
              page.tx,
              scope,
              request,
              page.now,
              "EVIDENCE_REQUEUED",
              audit,
            );
            recoverable++;
          } else {
            if (!recheck)
              throw new Error("Executable case recheck was not prepared");
            const summary = await recheck.capture(
              page.tx,
              scope,
              page.now,
              "sync",
            );
            await completeFinanceCaseRequest(
              page.tx,
              scope,
              request,
              page.now,
              recheck.outcome,
            );
            recoverable += summary.recoverable;
            exceptions += summary.exceptions;
          }
        }
        return { recoverable, exceptions };
      },
    },
  );
}
