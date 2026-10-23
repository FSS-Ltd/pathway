import { withTenantRlsContext, type Prisma } from "@pathway/db";
import type { FinanceConnectionScope } from "./finance-reconciliation.types";
import {
  runFinanceRecoveryPages,
  type FinanceRecoveryPageDependencies,
  type FinanceReconciliationPageSummary,
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
import { recordFinanceCaseRequestFailure } from "./finance-case-request-failure.persistence";

type PreparedRequest = { request: FinanceCaseRequest } & (
  | { kind: "replay" }
  | { kind: "recheck"; recheck: PreparedFinanceCaseRecheck }
  | { kind: "failed" }
);
export interface FinanceCaseRequestDependencies {
  states: FinanceRecoveryPageDependencies<
    FinanceCaseRequest,
    PreparedRequest
  >["states"];
  clock(): Date;
  prepareRecheck: PrepareFinanceCaseRecheck;
}

async function executeRequest(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
  prepared: Exclude<PreparedRequest, { kind: "failed" }>,
  now: Date,
): Promise<FinanceReconciliationPageSummary> {
  const { request } = prepared;
  if (prepared.kind === "replay") {
    const audit = await requeueFinanceCaseEvidence(tx, scope, request, now);
    await completeFinanceCaseRequest(
      tx,
      scope,
      request,
      now,
      "EVIDENCE_REQUEUED",
      audit,
    );
    return { recoverable: 1, exceptions: 0 };
  }
  const summary = await prepared.recheck.capture(tx, scope, now, "sync");
  await completeFinanceCaseRequest(
    tx,
    scope,
    request,
    now,
    prepared.recheck.outcome,
  );
  return summary;
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
          readPendingFinanceCaseRequests(
            tx,
            scope,
            window.to,
            window.cursor,
            dependencies.clock(),
          ),
        ),
      preparePage: async (requests) => {
        const prepared: PreparedRequest[] = [];
        for (const request of requests) {
          if (request.action === "REPLAY")
            prepared.push({ request, kind: "replay" });
          else {
            try {
              prepared.push({
                request,
                kind: "recheck",
                recheck: await dependencies.prepareRecheck(scope, request),
              });
            } catch {
              prepared.push({ request, kind: "failed" });
            }
          }
        }
        return prepared;
      },
      handlePage: async (page) => {
        const total = { recoverable: 0, exceptions: 0 };
        for (const prepared of page.objects) {
          const { request } = prepared;
          if (page.mode === "dry-run") {
            try {
              if (prepared.kind === "failed") {
                total.exceptions++;
                continue;
              }
              const summary = await withTenantRlsContext(
                scope.tenantId,
                scope.orgId,
                async (tx) => {
                  if (prepared.kind === "recheck")
                    return prepared.recheck.capture(
                      tx,
                      scope,
                      page.now,
                      "dry-run",
                    );
                  await inspectFinanceCaseEvidence(tx, scope, request);
                  return { recoverable: 1, exceptions: 0 };
                },
              );
              total.recoverable += summary.recoverable;
              total.exceptions += summary.exceptions;
            } catch {
              total.exceptions++;
            }
            continue;
          }
          if (!(await lockPendingFinanceCaseRequest(page.tx, scope, request)))
            continue;
          if (prepared.kind === "failed") {
            await recordFinanceCaseRequestFailure(
              page.tx,
              scope,
              request,
              page.now,
              "PREPARATION",
            );
            total.exceptions++;
            continue;
          }
          // A provider/canonical validation failure rolls back this request, not later requests or its retry audit.
          await page.tx.$executeRaw`SAVEPOINT finance_case_request_capture`;
          try {
            const summary = await executeRequest(
              page.tx,
              scope,
              prepared,
              page.now,
            );
            await page.tx
              .$executeRaw`RELEASE SAVEPOINT finance_case_request_capture`;
            total.recoverable += summary.recoverable;
            total.exceptions += summary.exceptions;
          } catch {
            await page.tx
              .$executeRaw`ROLLBACK TO SAVEPOINT finance_case_request_capture`;
            await page.tx
              .$executeRaw`RELEASE SAVEPOINT finance_case_request_capture`;
            await recordFinanceCaseRequestFailure(
              page.tx,
              scope,
              request,
              page.now,
              "CAPTURE",
            );
            total.exceptions++;
          }
        }
        return total;
      },
    },
  );
}
