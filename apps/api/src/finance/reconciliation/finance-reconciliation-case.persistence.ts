import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { Prisma } from "@pathway/db";
import type { FinanceConnectionScope } from "./finance-reconciliation.types";

type FinanceReconciliationCase = Prisma.FinanceReconciliationCaseGetPayload<
  Record<string, never>
>;

export interface FinanceReconciliationCaseDetection {
  key: string;
  kind: FinanceReconciliationCase["kind"];
  resourceReference?: string;
  money?: { amountMinor: bigint; currency: string };
  details: Prisma.InputJsonObject;
}

async function lockCase(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
  key: string,
): Promise<FinanceReconciliationCase | null> {
  const rows = await tx.$queryRaw<FinanceReconciliationCase[]>`
    SELECT * FROM "FinanceReconciliationCase"
    WHERE "stripeConnectionId" = ${scope.connectionId} AND "tenantId" = ${scope.tenantId}
      AND "orgId" = ${scope.orgId} AND "caseKey" = ${key} FOR UPDATE
  `;
  return rows[0] ?? null;
}

export async function detectReconciliationCase(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
  detection: FinanceReconciliationCaseDetection,
  now: Date,
): Promise<string> {
  const inserted = await tx.financeReconciliationCase.createMany({
    data: [
      {
        id: randomUUID(),
        stripeConnectionId: scope.connectionId,
        tenantId: scope.tenantId,
        orgId: scope.orgId,
        caseKey: detection.key,
        kind: detection.kind,
        resourceReference: detection.resourceReference ?? null,
        amountMinor: detection.money?.amountMinor ?? null,
        currency: detection.money?.currency ?? null,
        details: detection.details,
        createdAt: now,
        lastSeenAt: now,
      },
    ],
    skipDuplicates: true,
  });
  const existing = await lockCase(tx, scope, detection.key);
  if (!existing || existing.kind !== detection.kind)
    throw new Error("Finance reconciliation case identity conflicts");
  const reopened = existing.status === "RESOLVED";
  const changed =
    existing.resourceReference !== (detection.resourceReference ?? null) ||
    existing.amountMinor !== (detection.money?.amountMinor ?? null) ||
    existing.currency !== (detection.money?.currency ?? null) ||
    !isDeepStrictEqual(existing.details, detection.details);
  await tx.financeReconciliationCase.update({
    where: { id: existing.id },
    data: {
      resourceReference: detection.resourceReference ?? null,
      amountMinor: detection.money?.amountMinor ?? null,
      currency: detection.money?.currency ?? null,
      details: detection.details,
      lastSeenAt: now > existing.lastSeenAt ? now : existing.lastSeenAt,
      ...(reopened
        ? { status: "OPEN", resolvedAt: null, acknowledgedAt: null }
        : {}),
    },
  });
  const type = inserted.count
    ? "DETECTED"
    : reopened
      ? "REOPENED"
      : changed
        ? "UPDATED"
        : null;
  if (type)
    await tx.financeReconciliationCaseEvent.create({
      data: {
        caseId: existing.id,
        tenantId: scope.tenantId,
        orgId: scope.orgId,
        type,
        details: detection.details,
        createdAt: now,
      },
    });
  return existing.id;
}

export async function resolveReconciliationCase(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
  key: string,
  now: Date,
): Promise<void> {
  const existing = await lockCase(tx, scope, key);
  if (!existing || existing.status === "RESOLVED") return;
  await tx.financeReconciliationCase.update({
    where: { id: existing.id },
    data: { status: "RESOLVED", resolvedAt: now },
  });
  await tx.financeReconciliationCaseEvent.create({
    data: {
      caseId: existing.id,
      tenantId: scope.tenantId,
      orgId: scope.orgId,
      type: "RESOLVED",
      details: { reason: "provider_window_completed" },
      createdAt: now,
    },
  });
}
