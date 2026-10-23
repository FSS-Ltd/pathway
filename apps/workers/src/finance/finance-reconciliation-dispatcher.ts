import type {
  FinanceRecoveryWork,
  FinanceRecoveryResult,
} from "./finance-reconciliation-contracts";
export interface FinanceRecoveryStore {
  findDue(
    now: Date,
    livemode: boolean,
    limit: number,
    excluded?: readonly string[],
  ): Promise<FinanceRecoveryWork[]>;
}
export interface FinanceRecoveryProcessor {
  run(
    work: FinanceRecoveryWork,
    mode: "sync" | "dry-run",
  ): Promise<FinanceRecoveryResult>;
}
export interface FinanceReconciliationDispatchResult {
  dispatched: number;
  pages: number;
  completed: number;
  continued: number;
  busy: number;
  failed: number;
  disabled: number;
  objects: number;
  recoverable: number;
  exceptions: number;
  stopped: "exhausted" | "budget" | "limit";
}
const MAX_DISPATCHES = 500;
const DISPATCH_BUDGET_MS = 4 * 60_000;
const CONCURRENCY = 4;

/** API leases own durable progress. Stop launching at four minutes; active 55-second calls may drain until 4m55s. */
export class FinanceReconciliationDispatcher {
  constructor(
    private readonly store: FinanceRecoveryStore,
    private readonly processor: FinanceRecoveryProcessor,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async run(input: {
    livemode: boolean;
    mode: "sync" | "dry-run";
  }): Promise<FinanceReconciliationDispatchResult> {
    const deadline = this.clock().getTime() + DISPATCH_BUDGET_MS;
    const suppressed = new Set<string>();
    const result: FinanceReconciliationDispatchResult = {
      dispatched: 0,
      pages: 0,
      completed: 0,
      continued: 0,
      busy: 0,
      failed: 0,
      disabled: 0,
      objects: 0,
      recoverable: 0,
      exceptions: 0,
      stopped: "exhausted",
    };
    while (
      result.dispatched < MAX_DISPATCHES &&
      this.clock().getTime() < deadline
    ) {
      let due: FinanceRecoveryWork[];
      try {
        due = await this.store.findDue(this.clock(), input.livemode, 100, [
          ...suppressed,
        ]);
      } catch {
        throw new Error("Finance recovery discovery failed");
      }
      const unique = new Map(due.map((work) => [workKey(work), work]));
      const candidates = [...unique.values()].filter(
        (work) => !suppressed.has(workKey(work)),
      );
      if (!candidates.length) return result;
      for (let index = 0; index < candidates.length; index += CONCURRENCY) {
        if (
          this.clock().getTime() >= deadline ||
          result.dispatched >= MAX_DISPATCHES
        )
          break;
        const batch = candidates.slice(
          index,
          index + Math.min(CONCURRENCY, MAX_DISPATCHES - result.dispatched),
        );
        result.dispatched += batch.length;
        await Promise.all(
          batch.map(async (work) => {
            const key = workKey(work);
            try {
              const response = await this.processor.run(work, input.mode);
              result.pages += response.pages;
              result.objects += response.objects;
              result.recoverable += response.recoverable;
              result.exceptions += response.exceptions;
              if (response.status === "completed") result.completed++;
              else if (response.status === "continued") result.continued++;
              else if (response.status === "busy" || response.status === "lost")
                result.busy++;
              else if (response.status === "disabled") result.disabled++;
              else result.failed++;
              if (
                input.mode === "dry-run" ||
                response.status !== "continued" ||
                response.pages === 0 ||
                response.objects === 0
              )
                suppressed.add(key);
            } catch {
              result.failed++;
              suppressed.add(key);
            }
          }),
        );
      }
    }
    result.stopped = result.dispatched >= MAX_DISPATCHES ? "limit" : "budget";
    return result;
  }
}
function workKey(work: FinanceRecoveryWork): string {
  return `${work.connectionId}:${work.stream}`;
}
