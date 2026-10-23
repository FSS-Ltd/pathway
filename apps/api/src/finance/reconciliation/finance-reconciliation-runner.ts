import type { Prisma } from "@pathway/db";
import {
  type FinanceReconciliationObject,
  type FinanceReconciliationStream,
  type StripeFinanceReconciliationProvider,
} from "../stripe/finance-stripe-reconciliation.provider";
import type { FinanceReconciliationStateRepository } from "./finance-reconciliation-state.repository";
import type { FinanceConnectionScope } from "./finance-reconciliation.types";

export type FinanceReconciliationPageInput = {
  scope: FinanceConnectionScope;
  stream: FinanceReconciliationStream;
  objects: FinanceReconciliationObject[];
  now: Date;
} & ({ mode: "capture"; tx: Prisma.TransactionClient } | { mode: "dry-run" });

export type {
  FinanceReconciliationPageSummary,
  FinanceReconciliationRunResult,
} from "./finance-recovery-page-runner";
import {
  runFinanceRecoveryPages,
  type FinanceReconciliationPageSummary,
  type FinanceReconciliationRunResult,
} from "./finance-recovery-page-runner";
interface Dependencies {
  maxPages?: number;
  pageSize?: number;
  provider: Pick<StripeFinanceReconciliationProvider, "listPage">;
  states: Pick<
    FinanceReconciliationStateRepository,
    "preview" | "claim" | "commitPage" | "release" | "fail"
  >;
  preparePage(
    scope: FinanceConnectionScope,
    stream: FinanceReconciliationStream,
    objects: FinanceReconciliationObject[],
  ): Promise<FinanceReconciliationObject[]>;
  handlePage(
    input: FinanceReconciliationPageInput,
  ): Promise<FinanceReconciliationPageSummary>;
  clock(): Date;
}

export async function runFinanceReconciliation(
  input: {
    scope: FinanceConnectionScope;
    stream: FinanceReconciliationStream;
    mode: "sync" | "dry-run";
  },
  dependencies: Dependencies,
): Promise<FinanceReconciliationRunResult> {
  return runFinanceRecoveryPages(input, {
    states: dependencies.states,
    clock: dependencies.clock,
    maxPages: dependencies.maxPages ?? 10,
    readPage: (window) =>
      dependencies.provider.listPage(input.scope, input.stream, {
        pageSize: dependencies.pageSize ?? 10,
        from: window.from,
        to: window.to,
        ...(window.cursor ? { startingAfter: window.cursor } : {}),
      }),
    preparePage: (objects) =>
      dependencies.preparePage(input.scope, input.stream, objects),
    handlePage: (page) =>
      dependencies.handlePage({ ...page, stream: input.stream }),
  });
}
