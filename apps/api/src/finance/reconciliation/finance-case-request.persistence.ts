import { Prisma } from "@pathway/db";
import { z } from "zod";
import type { FinanceConnectionScope } from "./finance-reconciliation.types";
import { assertReconciliationScope } from "./finance-reconciliation-scope";
import {
  parseFinanceCaseRequest,
  type FinanceCaseRequest,
  type FinanceCaseRequestRow,
} from "./finance-case-request.contracts";

export async function readPendingFinanceCaseRequests(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
  cutoff: Date,
  cursor: string | null,
  now = cutoff,
): Promise<{ data: FinanceCaseRequest[]; nextCursor: string | null }> {
  if (!Number.isFinite(cutoff.getTime()))
    throw new Error("Case request cutoff is invalid");
  if (cursor) z.string().uuid().parse(cursor);
  await assertReconciliationScope(tx, scope);
  const rows = await tx.$queryRaw<FinanceCaseRequestRow[]>`
    SELECT e."id" AS "eventId", e."caseId", e."createdAt", e."details" AS "requestDetails",
      c."caseKey", c."kind", c."resourceReference", c."details" AS "caseDetails"
    FROM "FinanceReconciliationCaseEvent" e
    JOIN "FinanceReconciliationCase" c ON c."id" = e."caseId" AND c."tenantId" = e."tenantId" AND c."orgId" = e."orgId"
    WHERE e."tenantId" = ${scope.tenantId} AND e."orgId" = ${scope.orgId}
      AND c."stripeConnectionId" = ${scope.connectionId} AND e."type" = 'REPLAY_REQUESTED'
      AND e."createdAt" < ${cutoff} AND e."id" > ${cursor ?? ""}
      AND NOT EXISTS (
        SELECT 1 FROM "FinanceReconciliationCaseEvent" done
        WHERE done."tenantId" = e."tenantId" AND done."orgId" = e."orgId" AND done."caseId" = e."caseId"
          AND done."type" = 'UPDATED' AND done."createdAt" >= e."createdAt"
          AND done."details"->>'completedRequestId' = e."details"->>'requestId'
      ) AND NOT EXISTS (
        SELECT 1 FROM "FinanceReconciliationCaseEvent" failed
        WHERE failed."tenantId" = e."tenantId" AND failed."orgId" = e."orgId" AND failed."caseId" = e."caseId"
          AND failed."type" = 'UPDATED' AND failed."details"->>'failedRequestId' = e."details"->>'requestId'
          AND (failed."details"->>'retryAfter')::TIMESTAMPTZ > ${now}
      ) ORDER BY e."id" LIMIT 2
  `;
  return {
    data: rows.slice(0, 1).map(parseFinanceCaseRequest),
    nextCursor: rows.length > 1 ? (rows[0]?.eventId ?? null) : null,
  };
}

/** The caller owns the page lease transaction; the case lock serializes competing completion attempts. */
export async function lockPendingFinanceCaseRequest(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
  request: FinanceCaseRequest,
): Promise<boolean> {
  await assertReconciliationScope(tx, scope);
  await tx.$queryRaw`SELECT "id" FROM "FinanceReconciliationCase" WHERE "id" = ${request.caseId} AND "tenantId" = ${scope.tenantId} AND "orgId" = ${scope.orgId} AND "stripeConnectionId" = ${scope.connectionId} FOR UPDATE`;
  const event = await tx.financeReconciliationCaseEvent.findFirst({
    where: {
      id: request.eventId,
      caseId: request.caseId,
      tenantId: scope.tenantId,
      orgId: scope.orgId,
      type: "REPLAY_REQUESTED",
      case: { stripeConnectionId: scope.connectionId },
    },
    select: { details: true },
  });
  if (
    !event ||
    !event.details ||
    typeof event.details !== "object" ||
    Array.isArray(event.details) ||
    event.details.requestId !== request.requestId ||
    event.details.action !== request.action ||
    event.details.evidenceId !== request.evidenceId
  )
    throw new Error("Case request scope or identity changed");
  const completion = await tx.financeReconciliationCaseEvent.findFirst({
    where: {
      caseId: request.caseId,
      tenantId: scope.tenantId,
      orgId: scope.orgId,
      type: "UPDATED",
      createdAt: { gte: request.createdAt },
      details: { path: ["completedRequestId"], equals: request.requestId },
    },
    select: { id: true },
  });
  return !completion;
}

export async function inspectFinanceCaseEvidence(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
  request: FinanceCaseRequest,
  lock = false,
): Promise<{ id: string; status: string; attempts: number }> {
  if (!request.evidenceId) throw new Error("Stored case evidence is required");
  const rows = await tx.$queryRaw<
    Array<{ id: string; status: string; attempts: number }>
  >`
    SELECT "id", "status", "attempts" FROM "FinanceStripeWebhookEvent"
    WHERE "id" = ${request.evidenceId} AND "tenantId" = ${scope.tenantId} AND "orgId" = ${scope.orgId}
      AND "stripeAccountId" = ${scope.stripeAccountId} AND "livemode" = ${scope.livemode}
      AND (("evidenceSource" = 'API_RECONCILIATION' AND "reconciliationConnectionId" = ${scope.connectionId})
        OR ("evidenceSource" = 'SIGNED_WEBHOOK' AND "reconciliationConnectionId" IS NULL))
    ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}
  `;
  const evidence = rows[0];
  if (
    !evidence ||
    ![
      "COMPLETED",
      "RETRY",
      "DEAD_LETTER",
      "AWAITING_HANDLER",
      "RECEIVED",
    ].includes(evidence.status)
  )
    throw new Error(
      "Stored evidence is unavailable or has an active processing claim",
    );
  return evidence;
}

export async function requeueFinanceCaseEvidence(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
  request: FinanceCaseRequest,
  now: Date,
): Promise<Prisma.InputJsonObject> {
  const evidence = await inspectFinanceCaseEvidence(tx, scope, request, true);
  await tx.financeStripeWebhookEvent.update({
    where: { id: evidence.id },
    data: {
      status: "RETRY",
      nextAttemptAt: now,
      attempts: 0,
      claimedAt: null,
      claimToken: null,
    },
  });
  return {
    evidenceId: evidence.id,
    previousStatus: evidence.status,
    previousAttempts: evidence.attempts,
  };
}

export async function completeFinanceCaseRequest(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
  request: FinanceCaseRequest,
  now: Date,
  outcome: string,
  details: Prisma.InputJsonObject = {},
): Promise<void> {
  if (!outcome.trim() || outcome.length > 128)
    throw new Error("Case request outcome is invalid");
  await tx.financeReconciliationCaseEvent.create({
    data: {
      caseId: request.caseId,
      tenantId: scope.tenantId,
      orgId: scope.orgId,
      type: "UPDATED",
      createdAt: now,
      details: {
        ...details,
        completedRequestId: request.requestId,
        requestEventId: request.eventId,
        action: request.action,
        outcome,
      },
    },
  });
}
