import { randomUUID } from "node:crypto";
import type { Prisma } from "@pathway/db";
import { z } from "zod";
import { assertReconciliationScope } from "./finance-reconciliation-scope";
import type { FinanceConnectionScope } from "./finance-reconciliation.types";
import { projectFinancePayout } from "./finance-settlement.projection";
import {
  settlementDigest,
  type FinancePayoutCoverage,
} from "./finance-settlement-prepare";

export const payoutCoverageSchema = z.object({
  payoutDigest: z.string().regex(/^[a-f0-9]{64}$/),
  cutoff: z.string().datetime(),
  nextCursor: z
    .string()
    .regex(/^txn_[A-Za-z0-9_]+$/)
    .max(255)
    .nullable(),
  complete: z.boolean(),
  status: z.enum([
    "INCOMPLETE",
    "MANUAL_UNSUPPORTED",
    "CURRENCY_MISMATCH",
    "PAYOUT_PENDING",
    "MATCHED",
    "DIFFERENCE",
  ]),
  count: z.number().int().safe().nonnegative(),
  netMinor: z.string().regex(/^-?\d+$/),
  currencies: z.array(z.string().regex(/^[A-Z]{3}$/)).max(200),
});

interface StoredPayout {
  payoutId: string;
  payoutFacts: unknown;
  coverage: unknown;
  updatedAt: Date;
}
export interface FinanceUnresolvedPayout {
  payoutId: string;
  payout: ReturnType<typeof projectFinancePayout>;
  coverage: FinancePayoutCoverage;
}

export async function readFinanceUnresolvedPayoutPage(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
  cutoff: Date,
  cursor: string | null = null,
  limit = 10,
): Promise<{ data: FinanceUnresolvedPayout[]; nextCursor: string | null }> {
  await assertReconciliationScope(tx, scope);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Invalid payout recovery page size");
  const rows = await tx.$queryRaw<StoredPayout[]>`
    SELECT "payoutId", "payoutFacts", "coverage", "updatedAt" FROM "FinancePayoutReconciliation"
    WHERE "stripeConnectionId" = ${scope.connectionId} AND "tenantId" = ${scope.tenantId} AND "orgId" = ${scope.orgId}
      AND "status" <> 'MATCHED' AND "observedAt" <= ${cutoff} AND (${cursor}::text IS NULL OR "payoutId" > ${cursor})
    ORDER BY "payoutId" LIMIT ${limit + 1}
  `;
  return {
    data: rows.slice(0, limit).map((row) => ({
      payoutId: row.payoutId,
      payout: projectFinancePayout(scope, row.payoutFacts),
      coverage: payoutCoverageSchema.parse(row.coverage),
    })),
    nextCursor: rows.length > limit ? rows[limit - 1].payoutId : null,
  };
}

export async function readFinancePayoutContinuation(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
  payoutId: string,
): Promise<FinanceUnresolvedPayout | null> {
  await assertReconciliationScope(tx, scope);
  const rows = await tx.$queryRaw<
    StoredPayout[]
  >`SELECT "payoutId", "payoutFacts", "coverage", "updatedAt" FROM "FinancePayoutReconciliation" WHERE "stripeConnectionId" = ${scope.connectionId} AND "tenantId" = ${scope.tenantId} AND "orgId" = ${scope.orgId} AND "payoutId" = ${payoutId}`;
  const row = rows[0];
  return row
    ? {
        payoutId,
        payout: projectFinancePayout(scope, row.payoutFacts),
        coverage: payoutCoverageSchema.parse(row.coverage),
      }
    : null;
}

export async function persistSettlementEvidence(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
  facts: Prisma.InputJsonObject & { id: string; object: string },
  now: Date,
): Promise<void> {
  await persistSettlementEvidenceBatch(tx, scope, [facts], now);
}

export async function persistSettlementEvidenceBatch(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
  facts: (Prisma.InputJsonObject & { id: string; object: string })[],
  now: Date,
): Promise<void> {
  if (!facts.length) return;
  const rows = facts.map((fact) => ({
    id: randomUUID(),
    facts: fact,
    digest: settlementDigest(fact),
  }));
  await tx.$executeRaw`
    INSERT INTO "FinanceSettlementEvidence" ("id", "stripeConnectionId", "tenantId", "orgId", "stripeAccountId", "livemode", "resourceType", "providerReference", "digest", "facts", "observedAt")
    SELECT r->>'id', ${scope.connectionId}, ${scope.tenantId}, ${scope.orgId}, ${scope.stripeAccountId}, ${scope.livemode}, r->'facts'->>'object', r->'facts'->>'id', r->>'digest', r->'facts', ${now}
    FROM jsonb_array_elements(${JSON.stringify(rows)}::jsonb) r
    ON CONFLICT ("stripeConnectionId", "resourceType", "providerReference", "digest") DO NOTHING
  `;
}
