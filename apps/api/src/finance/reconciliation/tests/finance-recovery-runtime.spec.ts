import { runFinanceRecoveryRequest } from "../finance-recovery-runtime";
import { captureFinanceRecoveryPage } from "../finance-recovery-page-capture";
import { prepareFinanceRecoveryPage } from "../finance-recovery-page-preparation";
import type { FinanceRecoveryRequest } from "../finance-recovery.contracts";
import type { FinanceConnectionScope } from "../finance-reconciliation.types";

jest.mock("../finance-recovery-page-capture", () => ({
  captureFinanceRecoveryPage: jest.fn(async () => ({
    recoverable: 0,
    exceptions: 0,
  })),
}));
jest.mock("../finance-recovery-page-preparation", () => ({
  prepareFinanceRecoveryPage: jest.fn(
    async (_scope, _stream, objects) => objects,
  ),
}));
jest.mock("@pathway/db", () => ({
  ...jest.requireActual("@pathway/db"),
  withTenantRlsContext: jest.fn(async (_tenant, _org, read) => read({})),
}));
const now = new Date("2026-10-23T12:00:00Z");
const input: FinanceRecoveryRequest = {
  tenantId: "tenant",
  orgId: "org",
  connectionId: "11111111-1111-4111-8111-111111111111",
  stream: "events",
  mode: "sync",
};
const scope: FinanceConnectionScope = {
  ...input,
  stripeAccountId: "acct_school",
  livemode: false,
};
const window = {
  from: new Date("2026-10-22T00:00:00Z"),
  to: now,
  cursor: null,
  gap: null,
};
function dependencies() {
  const lease = {
    scope,
    stream: input.stream,
    stateId: "state",
    token: "token",
    window,
  };
  const states = {
    claim: jest.fn(async () => lease),
    preview: jest.fn(async () => window),
    commitPage: jest.fn(async (_lease, cursor, _at, persist) => {
      await persist({});
      return cursor
        ? {
            kind: "continued" as const,
            lease: { ...lease, window: { ...window, cursor } },
          }
        : { kind: "completed" as const };
    }),
    release: jest.fn(async () => undefined),
    fail: jest.fn(async () => undefined),
  };
  return {
    states,
    clock: () => now,
    loadScope: jest.fn(async () => scope),
    fetcher: jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>(
      async () =>
        new Response(
          JSON.stringify({
            object: "list",
            has_more: true,
            data: [
              {
                id: "evt_one",
                object: "event",
                created: Math.floor(window.from.getTime() / 1000),
                livemode: false,
                account: "acct_school",
                type: "customer.updated",
                data: { object: { id: "cus_one", object: "customer" } },
              },
            ],
          }),
          { status: 200 },
        ),
    ),
  };
}
describe("bounded Finance recovery runtime", () => {
  beforeEach(() => jest.clearAllMocks());
  it("disabled servicing exits before scope, state or provider access", async () => {
    const deps = dependencies();
    expect(
      await runFinanceRecoveryRequest(input, { mode: "disabled" }, deps),
    ).toMatchObject({ status: "disabled", pages: 0 });
    expect(deps.loadScope).not.toHaveBeenCalled();
    expect(deps.states.claim).not.toHaveBeenCalled();
    expect(deps.fetcher).not.toHaveBeenCalled();
  });
  it("rejects a stored account in another environment before a provider call", async () => {
    const deps = dependencies();
    deps.loadScope.mockResolvedValueOnce({ ...scope, livemode: true });
    await expect(
      runFinanceRecoveryRequest(
        input,
        { mode: "test", secretKey: "sk_test_synthetic" },
        deps,
      ),
    ).rejects.toThrow("environment");
    expect(deps.fetcher).not.toHaveBeenCalled();
    expect(deps.states.claim).not.toHaveBeenCalled();
  });
  it("captures one bounded provider page and persists continuation under the shared deadline", async () => {
    const deps = dependencies();
    const result = await runFinanceRecoveryRequest(
      input,
      { mode: "test", secretKey: "sk_test_synthetic" },
      deps,
    );
    expect(result).toMatchObject({ status: "continued", pages: 1, objects: 1 });
    expect(deps.fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = deps.fetcher.mock.calls[0];
    expect(new URL(String(url)).searchParams.get("limit")).toBe("10");
    expect(options?.headers).toMatchObject({ "Stripe-Account": "acct_school" });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(prepareFinanceRecoveryPage).toHaveBeenCalledTimes(1);
    expect(captureFinanceRecoveryPage).toHaveBeenCalledTimes(1);
    expect(deps.states.commitPage).toHaveBeenCalledWith(
      expect.anything(),
      "evt_one",
      now,
      expect.any(Function),
    );
    expect(deps.states.release).toHaveBeenCalledTimes(1);
  });
  it("dry run previews without claiming or advancing durable coverage", async () => {
    const deps = dependencies();
    const result = await runFinanceRecoveryRequest(
      { ...input, mode: "dry-run" },
      { mode: "test", secretKey: "sk_test_synthetic" },
      deps,
    );
    expect(result).toMatchObject({
      status: "continued",
      mode: "dry-run",
      pages: 1,
    });
    expect(deps.states.preview).toHaveBeenCalledTimes(1);
    expect(deps.states.claim).not.toHaveBeenCalled();
    expect(deps.states.commitPage).not.toHaveBeenCalled();
    expect(captureFinanceRecoveryPage).toHaveBeenCalledWith(
      expect.anything(),
      scope,
      "events",
      expect.any(Array),
      now,
      "dry-run",
    );
  });
});
