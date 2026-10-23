import {
  FinanceStripeReconciliationError,
  StripeFinanceReconciliationProvider,
  type FinanceReconciliationStream,
} from "../finance-stripe-reconciliation.provider";

const scope = { stripeAccountId: "acct_school_test", livemode: false };
const range = {
  from: new Date("2026-10-16T00:00:00Z"),
  to: new Date("2026-10-23T00:00:00Z"),
};
const created = Math.floor(range.from.getTime() / 1000) + 1;
const event = (id: string) => ({
  id,
  object: "event",
  created,
  livemode: false,
  type: "refund.updated",
  data: { object: { id: "re_refund", object: "refund" } },
});

describe("Stripe Finance reconciliation reader", () => {
  const resourceCases: Array<
    [FinanceReconciliationStream, string, string, string]
  > = [
    [
      "checkoutSessions",
      "checkout.session",
      "cs_session",
      "/v1/checkout/sessions",
    ],
    ["paymentIntents", "payment_intent", "pi_payment", "/v1/payment_intents"],
    ["charges", "charge", "ch_payment", "/v1/charges"],
    ["charges", "charge", "py_bacs_payment", "/v1/charges"],
    ["refunds", "refund", "re_refund", "/v1/refunds"],
    ["disputes", "dispute", "du_dispute", "/v1/disputes"],
    [
      "balanceTransactions",
      "balance_transaction",
      "txn_movement",
      "/v1/balance_transactions",
    ],
    ["payouts", "payout", "po_payout", "/v1/payouts"],
  ];

  it.each(resourceCases)(
    "reads %s through its own account-scoped resource",
    async (stream, object, id, path) => {
      const row = {
        id,
        object,
        created,
        ...(stream === "balanceTransactions" ? {} : { livemode: false }),
      };
      const provider = new StripeFinanceReconciliationProvider(
        "sk_test_fixture",
        async (input, init) => {
          const url = new URL(String(input));
          expect(new Headers(init?.headers).get("Stripe-Account")).toBe(
            scope.stripeAccountId,
          );
          expect(init?.method).toBe("GET");
          if (url.pathname === path)
            return json({ data: [row], has_more: false });
          expect(url.pathname).toBe(`${path}/${id}`);
          return jsonObject(row);
        },
      );
      expect(await provider.listPage(scope, stream, range)).toEqual({
        data: [row],
        nextCursor: null,
      });
      expect(await provider.retrieve(scope, stream, id)).toEqual(row);
    },
  );

  it("reads one account-scoped page and returns a resumable cursor", async () => {
    const requests: Array<{ url: URL; method?: string; headers: Headers }> = [];
    const provider = new StripeFinanceReconciliationProvider(
      "sk_test_fixture",
      async (input, init) => {
        requests.push({
          url: new URL(String(input)),
          method: init?.method,
          headers: new Headers(init?.headers),
        });
        return json({ data: [event("evt_one")], has_more: true });
      },
    );
    const page = await provider.listPage(scope, "events", range);
    expect(page.data).toEqual([event("evt_one")]);
    expect(page.nextCursor).toBe("evt_one");
    expect(requests).toHaveLength(1);
    expect(requests[0].url.pathname).toBe("/v1/events");
    expect(requests[0].url.searchParams.get("created[gte]")).toBe(
      String(created - 1),
    );
    expect(requests[0].url.searchParams.get("created[lt]")).toBe(
      String(range.to.getTime() / 1000),
    );
    expect(requests[0].url.searchParams.get("limit")).toBe("100");
    expect(requests[0].headers.get("Stripe-Account")).toBe(
      scope.stripeAccountId,
    );
    expect(requests[0].headers.get("Idempotency-Key")).toBeNull();
    expect(requests[0].method).toBe("GET");
  });

  it("resumes an interrupted page without changing its fixed date window", async () => {
    const requests: URL[] = [];
    const provider = new StripeFinanceReconciliationProvider(
      "sk_test_fixture",
      async (input) => {
        requests.push(new URL(String(input)));
        return json({ data: [event("evt_two")], has_more: false });
      },
    );
    const page = await provider.listPage(scope, "events", {
      ...range,
      startingAfter: "evt_one",
    });
    expect(page.nextCursor).toBeNull();
    expect(page.data[0].id).toBe("evt_two");
    expect(requests[0].searchParams.get("starting_after")).toBe("evt_one");
    expect(requests[0].searchParams.get("created[gte]")).toBe(
      String(created - 1),
    );
  });

  it.each([
    { data: [], has_more: true },
    { data: [event("evt_one"), event("evt_one")], has_more: false },
    { data: [event("evt_one")], has_more: true },
    { data: [{ ...event("evt_two"), account: "acct_other" }], has_more: false },
    { data: [{ ...event("evt_two"), livemode: true }], has_more: false },
    { data: [{ ...event("evt_two"), object: "charge" }], has_more: false },
    {
      data: [{ ...event("evt_two"), created: created - 100 }],
      has_more: false,
    },
  ])(
    "rejects incomplete, repeated or mis-scoped provider pages",
    async (payload) => {
      const provider = new StripeFinanceReconciliationProvider(
        "sk_test_fixture",
        async () => json(payload),
      );
      await expect(
        provider.listPage(scope, "events", {
          ...range,
          startingAfter: "evt_one",
        }),
      ).rejects.toBeInstanceOf(FinanceStripeReconciliationError);
    },
  );

  it("distinguishes a stale cursor from a provider outage", async () => {
    const provider = new StripeFinanceReconciliationProvider(
      "sk_test_fixture",
      async () =>
        json(
          { error: { param: "starting_after", message: "sensitive details" } },
          400,
        ),
    );
    await expect(
      provider.listPage(scope, "events", {
        ...range,
        startingAfter: "evt_one",
      }),
    ).rejects.toMatchObject({ reason: "INVALID_CURSOR" });
    const offline = new StripeFinanceReconciliationProvider(
      "sk_test_fixture",
      async () => {
        throw new Error("private network detail");
      },
    );
    await expect(
      offline.listPage(scope, "events", range),
    ).rejects.toMatchObject({
      reason: "UNAVAILABLE",
      message: "Stripe reconciliation data is unavailable",
    });
  });

  it("retrieves a known object without issuing a monetary request", async () => {
    const methods: string[] = [];
    const provider = new StripeFinanceReconciliationProvider(
      "sk_test_fixture",
      async (input, init) => {
        expect(new URL(String(input)).pathname).toBe("/v1/refunds/re_known");
        methods.push(init?.method ?? "");
        return jsonObject({
          id: "re_known",
          object: "refund",
          created,
          livemode: false,
        });
      },
    );
    const result = await provider.retrieve(scope, "refunds", "re_known");
    expect(result.id).toBe("re_known");
    expect(methods).toEqual(["GET"]);
  });

  it("rejects invalid account/key mode and resource identities before fetching", async () => {
    let calls = 0;
    const provider = new StripeFinanceReconciliationProvider(
      "sk_test_fixture",
      async () => {
        calls += 1;
        return json({ data: [], has_more: false });
      },
    );
    await expect(
      provider.listPage({ ...scope, livemode: true }, "events", range),
    ).rejects.toThrow();
    await expect(
      provider.retrieve(scope, "refunds", "pi_wrong"),
    ).rejects.toThrow();
    await expect(
      provider.listPage(
        { ...scope, stripeAccountId: "acct_/escape" },
        "events",
        range,
      ),
    ).rejects.toThrow();
    expect(calls).toBe(0);
  });
});

function json(
  value: { data?: unknown[]; has_more?: boolean; error?: unknown },
  status = 200,
): Response {
  return jsonObject({ object: "list", ...value }, status);
}

function jsonObject(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}
