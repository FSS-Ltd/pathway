import { AsyncLocalStorage } from "node:async_hooks";
import type { Prisma } from "@prisma/client";

export type TransactionScope =
  | { kind: "tenant"; tenantId: string; orgId: string | null; readOnly: false }
  | { kind: "org"; orgId: string; readOnly: boolean }
  | { kind: "unscoped"; readOnly: boolean };

export interface ActiveTransaction {
  client: Prisma.TransactionClient;
  scope: TransactionScope;
}

const transactionStorage = new AsyncLocalStorage<ActiveTransaction>();

export function activeTransaction(): ActiveTransaction | undefined {
  return transactionStorage.getStore();
}

export function assertCompatibleScope(
  active: ActiveTransaction,
  requested: TransactionScope,
): void {
  const current = active.scope;
  if (
    current.kind !== requested.kind ||
    (current.kind === "tenant" &&
      requested.kind === "tenant" &&
      (current.tenantId !== requested.tenantId ||
        current.orgId !== requested.orgId)) ||
    (current.kind === "org" &&
      requested.kind === "org" &&
      current.orgId !== requested.orgId)
  ) {
    throw new Error(
      "Cannot change the scope of an active database transaction",
    );
  }
  if (current.readOnly && !requested.readOnly) {
    throw new Error("Cannot write inside a read-only database transaction");
  }
}

export function runWithTransaction<T>(
  transaction: ActiveTransaction,
  operation: () => Promise<T>,
): Promise<T> {
  const active = activeTransaction();
  if (active) {
    if (active.client !== transaction.client) {
      throw new Error("Cannot replace an active database transaction");
    }
    assertCompatibleScope(active, transaction.scope);
    return operation();
  }
  return transactionStorage.run(transaction, operation);
}
