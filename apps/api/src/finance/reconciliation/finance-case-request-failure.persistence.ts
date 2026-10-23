import type { Prisma } from "@pathway/db";
import type { FinanceConnectionScope } from "./finance-reconciliation.types";
import type { FinanceCaseRequest } from "./finance-case-request.contracts";
import { completeFinanceCaseRequest } from "./finance-case-request.persistence";

const MAX_ATTEMPTS = 3;
const RETRY_MS = 5 * 60_000;

/** A failed request stays visible without blocking the connection's later work. */
export async function recordFinanceCaseRequestFailure(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
  request: FinanceCaseRequest,
  now: Date,
  phase: "PREPARATION" | "CAPTURE",
): Promise<void> {
  const attempts =
    1 +
    (await tx.financeReconciliationCaseEvent.count({
      where: {
        tenantId: scope.tenantId,
        orgId: scope.orgId,
        caseId: request.caseId,
        type: "UPDATED",
        details: { path: ["failedRequestId"], equals: request.requestId },
      },
    }));
  if (attempts >= MAX_ATTEMPTS) {
    await completeFinanceCaseRequest(
      tx,
      scope,
      request,
      now,
      "MANUAL_REVIEW_REQUIRED_RETRY_EXHAUSTED",
      { attempts, phase },
    );
    return;
  }
  await tx.financeReconciliationCaseEvent.create({
    data: {
      tenantId: scope.tenantId,
      orgId: scope.orgId,
      caseId: request.caseId,
      type: "UPDATED",
      createdAt: now,
      details: {
        failedRequestId: request.requestId,
        requestEventId: request.eventId,
        action: request.action,
        outcome: "RETRY_SCHEDULED",
        attempts,
        phase,
        retryAfter: new Date(now.getTime() + RETRY_MS).toISOString(),
      },
    },
  });
}
