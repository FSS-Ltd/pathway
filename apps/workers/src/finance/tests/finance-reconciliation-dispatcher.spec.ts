import { FinanceReconciliationDispatcher } from "../finance-reconciliation-dispatcher";
import {
  readFinanceReconciliationConfig,
  readFinanceReconciliationMode,
} from "../finance-reconciliation-config";

const work = {
  tenantId: "tenant-a",
  orgId: "org-a",
  connectionId: "00000000-0000-4000-8000-000000000001",
  stream: "events" as const,
};
const summary = {
  mode: "sync" as const,
  status: "completed" as const,
  pages: 1,
  objects: 2,
  recoverable: 1,
  exceptions: 0,
};
describe("Finance recovery worker controls", () => {
  it("defaults off without requiring database or provider configuration", () => {
    expect(readFinanceReconciliationConfig({})).toEqual({ enabled: false });
    expect(() =>
      readFinanceReconciliationConfig({
        ENABLE_FINANCE_RECONCILIATION: "true",
      }),
    ).toThrow();
  });
  it("preserves the old unfiltered worker unless a valid mode is explicitly supplied", () => {
    expect(readFinanceReconciliationMode(undefined)).toBeUndefined();
    expect(readFinanceReconciliationMode("test")).toBe(false);
    expect(readFinanceReconciliationMode("live")).toBe(true);
    expect(() => readFinanceReconciliationMode("disabled")).toThrow();
  });
  it("does not hot-loop busy or failed work and forwards explicit environment", async () => {
    const store = { findDue: jest.fn().mockResolvedValue([work]) };
    const processor = {
      run: jest.fn().mockResolvedValue({ ...summary, status: "busy" }),
    };
    const result = await new FinanceReconciliationDispatcher(
      store,
      processor,
    ).run({ livemode: false, mode: "sync" });
    expect(processor.run).toHaveBeenCalledTimes(1);
    expect(store.findDue).toHaveBeenCalledWith(
      expect.any(Date),
      false,
      100,
      [],
    );
    expect(result).toMatchObject({ dispatched: 1, busy: 1 });
  });
  it("allows progress continuations while stopping at the dispatch cap", async () => {
    const store = { findDue: jest.fn().mockResolvedValue([work]) };
    const processor = {
      run: jest.fn().mockResolvedValue({ ...summary, status: "continued" }),
    };
    const result = await new FinanceReconciliationDispatcher(
      store,
      processor,
      () => new Date(0),
    ).run({ livemode: false, mode: "sync" });
    expect(result.dispatched).toBe(500);
  });
  it("reports failures without exposing server errors or secrets", async () => {
    const store = { findDue: jest.fn().mockResolvedValue([work]) };
    const processor = {
      run: jest.fn().mockRejectedValue(new Error("secret provider detail")),
    };
    const result = await new FinanceReconciliationDispatcher(
      store,
      processor,
    ).run({ livemode: true, mode: "sync" });
    expect(result).toMatchObject({ dispatched: 1, failed: 1 });
    expect(JSON.stringify(result)).not.toContain("secret provider detail");
  });
  it("keeps at most four calls in flight and stops launches at four minutes", async () => {
    let time = 0;
    let active = 0;
    let peak = 0;
    const rows = Array.from({ length: 8 }, (_, index) => ({
      ...work,
      tenantId: `tenant-${index}`,
      connectionId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    }));
    const store = { findDue: jest.fn().mockResolvedValue(rows) };
    const processor = {
      run: jest.fn(async () => {
        active++;
        peak = Math.max(peak, active);
        await Promise.resolve();
        time = 240_000;
        active--;
        return summary;
      }),
    };
    const result = await new FinanceReconciliationDispatcher(
      store,
      processor,
      () => new Date(time),
    ).run({ livemode: false, mode: "sync" });
    expect(peak).toBe(4);
    expect(result).toMatchObject({ dispatched: 4, stopped: "budget" });
  });
  it("does not redispatch dry-run or no-progress pages", async () => {
    for (const mode of ["sync", "dry-run"] as const) {
      const store = { findDue: jest.fn().mockResolvedValue([work]) };
      const processor = {
        run: jest.fn().mockResolvedValue({
          ...summary,
          mode,
          status: "continued",
          pages: 0,
          objects: 0,
        }),
      };
      await new FinanceReconciliationDispatcher(store, processor).run({
        livemode: false,
        mode,
      });
      expect(processor.run).toHaveBeenCalledTimes(1);
    }
  });
  it("reaches later work when the first hundred transports fail without durable API progress", async () => {
    const rows = Array.from({ length: 101 }, (_, index) => ({
      ...work,
      connectionId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    }));
    const store = {
      findDue: jest
        .fn()
        .mockImplementation(
          async (
            _now: Date,
            _live: boolean,
            limit: number,
            excluded: readonly string[] = [],
          ) =>
            rows
              .filter(
                (row) =>
                  !excluded.includes(`${row.connectionId}:${row.stream}`),
              )
              .slice(0, limit),
        ),
    };
    const last = rows[100];
    const processor = {
      run: jest.fn().mockImplementation(async (row: typeof work) => {
        if (row.connectionId !== last?.connectionId)
          throw new Error("Transport unavailable");
        return summary;
      }),
    };
    const result = await new FinanceReconciliationDispatcher(
      store,
      processor,
    ).run({ livemode: false, mode: "sync" });
    expect(result).toMatchObject({
      dispatched: 101,
      failed: 100,
      completed: 1,
    });
    expect(processor.run).toHaveBeenCalledWith(last, "sync");
    expect(store.findDue.mock.calls[1]?.[3]).toHaveLength(100);
    expect(processor.run).toHaveBeenCalledTimes(101);
  });
});
