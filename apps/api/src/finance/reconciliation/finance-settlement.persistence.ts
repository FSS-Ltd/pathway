import type { FinanceReconciliationPageSummary } from "./finance-reconciliation-runner";
import { matchFinanceCharge } from "./finance-charge-match";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@pathway/db";
import { assertReconciliationScope } from "./finance-reconciliation-scope";
import type { FinanceConnectionScope } from "./finance-reconciliation.types";
import {
  detectReconciliationCase,
  resolveReconciliationCase,
} from "./finance-reconciliation-case.persistence";

import {
  projectFinanceCharge,
  projectFinanceBalanceTransaction,
  projectFinancePayout,
} from "./finance-settlement.projection";
import {
  settlementDigest,
  type FinancePreparedPayoutSettlement,
} from "./finance-settlement-prepare";

import {
  payoutCoverageSchema,
  readFinancePayoutContinuation,
  persistSettlementEvidence as evidence,
  persistSettlementEvidenceBatch,
} from "./finance-settlement.repository";
export {
  readFinancePayoutContinuation,
  readFinanceUnresolvedPayoutPage,
} from "./finance-settlement.repository";
export type { FinanceUnresolvedPayout } from "./finance-settlement.repository";

/** Persists evidence/cases only. No canonical money handler or ledger writer is called. */
export async function captureFinanceSettlementObservation(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
  stream: "charges" | "balanceTransactions" | "payouts",
  raw: unknown,
  observedAt: Date,
  preparedPayout?: FinancePreparedPayoutSettlement,
  mode: "capture" | "dry-run" = "capture",
): Promise<FinanceReconciliationPageSummary> {
  await assertReconciliationScope(tx, scope);
  if (stream === "balanceTransactions") {
    const balance = projectFinanceBalanceTransaction(scope, raw);
    if (mode === "capture") await evidence(tx, scope, balance, observedAt);
    return { recoverable: 0, exceptions: 0 };
  }
  if (stream === "charges") {
    const charge = projectFinanceCharge(scope, raw);
    if (mode === "capture") await evidence(tx, scope, charge, observedAt);
    const key = `settlement:charge:${settlementDigest(charge.id)}`;
    const checkout = charge.payment_intent
      ? await tx.financeCheckoutAttempt.findFirst({
          where: {
            tenantId: scope.tenantId,
            orgId: scope.orgId,
            stripeConnectionId: scope.connectionId,
            stripeAccountId: scope.stripeAccountId,
            livemode: scope.livemode,
            stripePaymentIntentId: charge.payment_intent,
          },
          select: { amountMinor: true, currency: true },
        })
      : null;
    const debit =
      !checkout && charge.payment_intent
        ? await tx.financeDebitAttempt.findFirst({
            where: {
              tenantId: scope.tenantId,
              orgId: scope.orgId,
              stripeConnectionId: scope.connectionId,
              stripeAccountId: scope.stripeAccountId,
              stripePaymentIntentId: charge.payment_intent,
            },
            select: { amountMinor: true, currency: true },
          })
        : null;
    const matched = checkout ?? debit;
    const disposition = matchFinanceCharge(charge, matched);
    if (mode === "dry-run")
      return {
        recoverable: 0,
        exceptions:
          disposition === "MISMATCH" || disposition === "UNMATCHED_MONEY"
            ? 1
            : 0,
      };
    if (disposition === "MATCHED")
      await resolveReconciliationCase(
        tx,
        scope,
        key,
        observedAt,
        "charge_operation_matched_without_receipt_inference",
      );
    else if (disposition === "MISMATCH" || disposition === "UNMATCHED_MONEY")
      await detectReconciliationCase(
        tx,
        scope,
        {
          key,
          kind: matched ? "UNKNOWN_OPERATION" : "UNMATCHED_MONEY",
          resourceReference: charge.id,
          money: {
            amountMinor: BigInt(charge.amount),
            currency: charge.currency,
          },
          details: {
            reason: matched ? "CHARGE_OPERATION_MISMATCH" : "UNMATCHED_CHARGE",
            fundsConfirmed:
              charge.paid && charge.captured && charge.status === "succeeded",
            receiptInferred: false,
          },
        },
        observedAt,
      );
    return {
      recoverable: 0,
      exceptions:
        disposition === "MISMATCH" || disposition === "UNMATCHED_MONEY" ? 1 : 0,
    };
  }
  const payout = projectFinancePayout(scope, raw);
  if (
    !preparedPayout ||
    preparedPayout.payoutDigest !== settlementDigest(payout)
  )
    throw new Error("Payout constituent preparation is required");
  const coverage = payoutCoverageSchema.parse(preparedPayout);
  if (mode === "capture")
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${scope.connectionId}), hashtext(${payout.id}))`;
  const stored = await readFinancePayoutContinuation(tx, scope, payout.id);
  if (
    stored &&
    settlementDigest(stored.coverage) === settlementDigest(coverage)
  )
    return {
      recoverable: 0,
      exceptions: coverage.status === "MATCHED" ? 0 : 1,
    };
  if (
    preparedPayout.previousDigest !==
    (stored?.coverage.status === "INCOMPLETE"
      ? settlementDigest(stored.coverage)
      : null)
  )
    throw new Error("Payout coverage continuation changed");
  if (stored && observedAt < new Date(stored.coverage.cutoff))
    throw new Error("Payout observation predates stored coverage");
  const constituents = preparedPayout.constituents.map((row) =>
    projectFinanceBalanceTransaction(scope, row),
  );
  const ids = constituents.map((row) => row.id);
  const duplicates = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "FinanceSettlementEvidence"
    WHERE "stripeConnectionId" = ${scope.connectionId} AND "tenantId" = ${scope.tenantId} AND "orgId" = ${scope.orgId}
      AND "resourceType" = 'payout.constituent'
      AND "providerReference" IN (SELECT jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb))
      AND "facts"->>'payoutId' = ${payout.id} AND "facts"->>'payoutDigest' = ${coverage.payoutDigest}
      AND "facts"->>'cutoff' = ${coverage.cutoff} LIMIT 1
  `;
  if (duplicates.length)
    throw new Error("Payout constituent was already counted");
  if (mode === "dry-run")
    return {
      recoverable: 0,
      exceptions: coverage.status === "MATCHED" ? 0 : 1,
    };
  await evidence(tx, scope, payout, observedAt);
  await persistSettlementEvidenceBatch(
    tx,
    scope,
    constituents.flatMap((row) => [
      row,
      {
        ...row,
        object: "payout.constituent",
        payoutId: payout.id,
        payoutDigest: coverage.payoutDigest,
        cutoff: coverage.cutoff,
      },
    ]),
    observedAt,
  );
  await evidence(
    tx,
    scope,
    {
      id: payout.id,
      object: "payout.coverage",
      payout,
      coverage: { ...coverage },
    },
    observedAt,
  );
  await tx.$executeRaw`
    INSERT INTO "FinancePayoutReconciliation" ("id", "stripeConnectionId", "tenantId", "orgId", "payoutId", "payoutFacts", "coverage", "complete", "status", "observedAt", "updatedAt")
    VALUES (${randomUUID()}, ${scope.connectionId}, ${scope.tenantId}, ${scope.orgId}, ${payout.id}, ${JSON.stringify(payout)}::jsonb, ${JSON.stringify(coverage)}::jsonb, ${coverage.complete}, ${coverage.status}, ${new Date(coverage.cutoff)}, ${observedAt})
    ON CONFLICT ("stripeConnectionId", "payoutId") DO UPDATE SET "payoutFacts" = EXCLUDED."payoutFacts", "coverage" = EXCLUDED."coverage", "complete" = EXCLUDED."complete", "status" = EXCLUDED."status", "observedAt" = EXCLUDED."observedAt", "updatedAt" = EXCLUDED."updatedAt"
  `;
  const key = `settlement:payout:${settlementDigest(payout.id)}`;
  if (coverage.status === "MATCHED")
    await resolveReconciliationCase(
      tx,
      scope,
      key,
      observedAt,
      "automatic_payout_net_matches_complete_coverage",
    );
  else
    await detectReconciliationCase(
      tx,
      scope,
      {
        key,
        kind: "SETTLEMENT_DIFFERENCE",
        resourceReference: payout.id,
        money: {
          amountMinor: BigInt(payout.amount),
          currency: payout.currency,
        },
        details: {
          reason: coverage.status,
          complete: coverage.complete,
          constituentCount: coverage.count,
          netMinor: coverage.netMinor,
          currency: payout.currency,
          familyDebtAffected: false,
          cutoff: coverage.cutoff,
        },
      },
      observedAt,
    );
  return { recoverable: 0, exceptions: coverage.status === "MATCHED" ? 0 : 1 };
}
