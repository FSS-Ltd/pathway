import { makeFinanceApiEvidence } from "../finance-api-evidence.persistence";

const scope = {
  connectionId: "connection",
  tenantId: "tenant",
  orgId: "org",
  stripeAccountId: "acct_school",
  livemode: false,
};
const object = {
  id: "re_refund",
  object: "refund",
  amount: 1000,
  currency: "gbp",
  status: "succeeded",
};
const observedAt = new Date("2026-10-23T12:00:00Z");

describe("API-reconciliation evidence identity and time", () => {
  it("retains an original provider event ID and time with explicit API provenance", () => {
    const evidence = makeFinanceApiEvidence(
      scope,
      "refund.updated",
      object,
      observedAt,
      { kind: "provider-event", id: "evt_original", created: 1_800_000_000 },
    );
    expect(evidence.eventId).toBe("evt_original");
    expect(evidence.payload).toMatchObject({
      id: "evt_original",
      created: 1_800_000_000,
      reconciliation: {
        basis: "provider-event",
        source_reference: "evt_original",
        observed_at: "2026-10-23T12:00:00.000Z",
      },
    });
  });

  it("uses the proven balance-movement time instead of the later observation time", () => {
    const evidence = makeFinanceApiEvidence(
      scope,
      "charge.dispute.funds_withdrawn",
      object,
      observedAt,
      {
        kind: "balance-transaction",
        id: "txn_withdrawal",
        created: 1_700_000_000,
      },
    );
    expect(evidence.payload).toMatchObject({
      created: 1_700_000_000,
      reconciliation: {
        basis: "balance-transaction",
        source_reference: "txn_withdrawal",
      },
    });
    expect(evidence.eventId).toMatch(/^recovery_/);
  });

  it("keeps a current-object snapshot ID stable across repeated observation times", () => {
    const first = makeFinanceApiEvidence(
      scope,
      "refund.updated",
      object,
      observedAt,
    );
    const second = makeFinanceApiEvidence(
      scope,
      "refund.updated",
      object,
      new Date("2026-10-24T12:00:00Z"),
    );
    expect(second.eventId).toBe(first.eventId);
    expect(first.payload).toMatchObject({
      created: Math.floor(observedAt.getTime() / 1000),
      reconciliation: { basis: "current-object" },
    });
  });

  it("distinguishes real state changes and different school accounts", () => {
    const first = makeFinanceApiEvidence(
      scope,
      "refund.updated",
      object,
      observedAt,
    );
    expect(
      makeFinanceApiEvidence(
        scope,
        "refund.updated",
        { ...object, status: "failed" },
        observedAt,
      ).eventId,
    ).not.toBe(first.eventId);
    expect(
      makeFinanceApiEvidence(
        { ...scope, stripeAccountId: "acct_other" },
        "refund.updated",
        object,
        observedAt,
      ).eventId,
    ).not.toBe(first.eventId);
  });

  it("distinguishes two proved movements of the same economic resource", () => {
    const first = makeFinanceApiEvidence(
      scope,
      "charge.dispute.funds_withdrawn",
      object,
      observedAt,
      { kind: "balance-transaction", id: "txn_first", created: 1_700_000_000 },
    );
    const second = makeFinanceApiEvidence(
      scope,
      "charge.dispute.funds_withdrawn",
      object,
      observedAt,
      { kind: "balance-transaction", id: "txn_second", created: 1_700_000_100 },
    );
    expect(second.eventId).not.toBe(first.eventId);
  });

  it.each([
    {
      kind: "provider-event" as const,
      id: "txn_wrong",
      created: 1_700_000_000,
    },
    {
      kind: "balance-transaction" as const,
      id: "txn_valid",
      created: Number.NaN,
    },
  ])("rejects invalid origin identity or time", (origin) => {
    expect(() =>
      makeFinanceApiEvidence(
        scope,
        "refund.updated",
        object,
        observedAt,
        origin,
      ),
    ).toThrow();
  });
});
