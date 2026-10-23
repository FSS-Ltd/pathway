import {
  planFinanceUnresolvedSearch,
  matchesFinanceUnresolvedMetadata,
} from "../finance-unresolved-search";
const operation = {
  key: "checkout:local",
  kind: "checkout" as const,
  id: "local",
  createdAt: new Date("2026-10-01T00:00:00Z"),
  resourceId: null,
};
describe("historical unknown-operation search", () => {
  it("retains an aged operation's bounded submission window", () => {
    const plan = planFinanceUnresolvedSearch(
      operation,
      operation.createdAt,
      null,
      new Date("2026-10-23T00:00:00Z"),
    );
    expect(plan).toMatchObject({
      stream: "checkoutSessions",
      from: "2026-09-30T23:55:00.000Z",
      to: "2026-10-01T23:05:00.000Z",
      cursor: null,
      exhausted: false,
    });
  });
  it("resumes the exact fixed window before extending it", () => {
    const initial = planFinanceUnresolvedSearch(
      operation,
      operation.createdAt,
      null,
      new Date("2026-10-01T01:00:00Z"),
    );
    const continuation = { ...initial, cursor: "cs_next" };
    expect(
      planFinanceUnresolvedSearch(
        operation,
        operation.createdAt,
        continuation,
        new Date("2026-10-23T00:00:00Z"),
      ),
    ).toEqual(continuation);
    expect(
      planFinanceUnresolvedSearch(
        operation,
        operation.createdAt,
        { ...initial, exhausted: true },
        new Date("2026-10-23T00:00:00Z"),
      ).to,
    ).toBe("2026-10-01T23:05:00.000Z");
  });
  it("does not restart a completed aged search or accept another operation's cursor", () => {
    const plan = planFinanceUnresolvedSearch(
      operation,
      operation.createdAt,
      null,
      new Date("2026-10-23T00:00:00Z"),
    );
    expect(
      planFinanceUnresolvedSearch(
        operation,
        operation.createdAt,
        { ...plan, exhausted: true },
        new Date("2026-10-24T00:00:00Z"),
      ).exhausted,
    ).toBe(true);
    expect(
      planFinanceUnresolvedSearch(
        operation,
        operation.createdAt,
        { ...plan, stream: "refunds", cursor: "re_wrong" },
        new Date("2026-10-24T00:00:00Z"),
      ).cursor,
    ).toBeNull();
  });
  it("uses refund provider-attempt time rather than request creation", () => {
    expect(
      planFinanceUnresolvedSearch(
        { ...operation, kind: "refund", key: "refund:local" },
        new Date("2026-10-20T00:00:00Z"),
        null,
        new Date("2026-10-23T00:00:00Z"),
      ).from,
    ).toBe("2026-10-19T23:55:00.000Z");
  });
  it("only selects metadata for this immutable operation before canonical matching", () => {
    expect(
      matchesFinanceUnresolvedMetadata(operation, {
        metadata: { finance_checkout_attempt_id: "local" },
      }),
    ).toBe(true);
    expect(
      matchesFinanceUnresolvedMetadata(operation, {
        metadata: { finance_checkout_attempt_id: "other" },
      }),
    ).toBe(false);
    expect(
      matchesFinanceUnresolvedMetadata(operation, { metadata: null }),
    ).toBe(false);
  });
});
