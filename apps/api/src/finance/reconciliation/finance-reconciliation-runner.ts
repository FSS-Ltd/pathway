import type { Prisma } from "@pathway/db";
import {
  FinanceStripeReconciliationError,
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

export interface FinanceReconciliationPageSummary {
  recoverable: number;
  exceptions: number;
}

export interface FinanceReconciliationRunResult extends FinanceReconciliationPageSummary {
  mode: "sync" | "dry-run";
  status: "completed" | "continued" | "busy" | "failed" | "lost";
  pages: number;
  objects: number;
  reason?: FinanceStripeReconciliationError["reason"] | "CAPTURE_FAILED";
}

interface Dependencies {
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
  const { states, provider, preparePage, handlePage, clock } = dependencies;
  const result: FinanceReconciliationRunResult = {
    mode: input.mode,
    status: "busy",
    pages: 0,
    objects: 0,
    recoverable: 0,
    exceptions: 0,
  };
  let lease =
    input.mode === "sync"
      ? await states.claim(input.scope, input.stream, clock())
      : null;
  let window =
    input.mode === "dry-run"
      ? await states.preview(input.scope, input.stream, clock())
      : lease?.window;
  if (!window)
    return input.mode === "dry-run"
      ? { ...result, status: "completed" }
      : result;

  try {
    for (let pageNumber = 0; pageNumber < 10; pageNumber++) {
      let phase: "provider" | "capture" = "provider";
      try {
        const page = await provider.listPage(input.scope, input.stream, {
          from: window.from,
          to: window.to,
          ...(window.cursor ? { startingAfter: window.cursor } : {}),
        });
        const objects = await preparePage(input.scope, input.stream, page.data);
        phase = "capture";
        let summary: FinanceReconciliationPageSummary = {
          recoverable: 0,
          exceptions: 0,
        };
        if (input.mode === "dry-run") {
          summary = await handlePage({
            mode: "dry-run",
            scope: input.scope,
            stream: input.stream,
            objects,
            now: clock(),
          });
        } else {
          if (!lease)
            throw new Error("Finance reconciliation lease is missing");
          const committed = await states.commitPage(
            lease,
            page.nextCursor,
            clock(),
            async (tx) => {
              summary = await handlePage({
                mode: "capture",
                tx,
                scope: input.scope,
                stream: input.stream,
                objects,
                now: clock(),
              });
            },
          );
          if (committed.kind === "lost") return { ...result, status: "lost" };
          lease = committed.kind === "continued" ? committed.lease : null;
        }
        result.pages++;
        result.objects += page.data.length;
        result.recoverable += summary.recoverable;
        result.exceptions += summary.exceptions;
        if (!page.nextCursor) return { ...result, status: "completed" };
        window = { ...window, cursor: page.nextCursor };
      } catch (error) {
        const reason =
          phase === "capture"
            ? "CAPTURE_FAILED"
            : error instanceof FinanceStripeReconciliationError
              ? error.reason
              : "UNAVAILABLE";
        if (lease) await states.fail(lease, reason, clock());
        return { ...result, status: "failed", reason };
      }
    }
    return { ...result, status: "continued" };
  } finally {
    if (lease) await states.release(lease);
  }
}
