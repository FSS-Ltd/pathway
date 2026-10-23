import { StripeFinancePayoutConstituentsProvider } from "./finance-stripe-payout-constituents.provider";
const scope = { stripeAccountId: "acct_school", livemode: false };
const row = {
  id: "txn_one",
  object: "balance_transaction",
  created: 1,
  amount: 100,
  fee: 10,
  net: 90,
  currency: "gbp",
  source: "ch_one",
  type: "charge",
  available_on: 2,
  status: "available",
};
function provider(payload: unknown, status = 200) {
  const fetcher = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockResolvedValue(new Response(JSON.stringify(payload), { status }));
  return {
    fetcher,
    client: new StripeFinancePayoutConstituentsProvider(
      "sk_test_synthetic",
      fetcher,
    ),
  };
}
describe("automatic payout constituent read adapter", () => {
  it("uses payout-filtered account-scoped GET with pinned API and no created filter", async () => {
    const { client, fetcher } = provider({
      object: "list",
      data: [row],
      has_more: true,
    });
    expect(await client.listPage(scope, "po_one")).toMatchObject({
      nextCursor: "txn_one",
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.stripe.com/v1/balance_transactions?payout=po_one&limit=100",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "Stripe-Account": "acct_school",
          "Stripe-Version": "2026-09-30.endive",
        }),
      }),
    );
  });
  it("rejects mode/account/resource mismatches before reading", async () => {
    const { client, fetcher } = provider({});
    await expect(
      client.listPage({ ...scope, livemode: true }, "po_one"),
    ).rejects.toMatchObject({ reason: "INVALID_SCOPE" });
    await expect(client.listPage(scope, "ch_one")).rejects.toMatchObject({
      reason: "INVALID_SCOPE",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    { object: "list", data: [], has_more: true },
    { object: "list", data: [row, row], has_more: false },
    { object: "list", data: [{ ...row, net: 99 }], has_more: false },
    {
      object: "list",
      data: [{ ...row, account: "acct_other" }],
      has_more: false,
    },
  ])("rejects incomplete or malformed pagination", async (payload) => {
    await expect(
      provider(payload).client.listPage(scope, "po_one"),
    ).rejects.toMatchObject({ reason: "INVALID_RESPONSE" });
  });
  it("distinguishes stale cursor and outage without returning empty coverage", async () => {
    await expect(
      provider({ error: { param: "starting_after" } }, 400).client.listPage(
        scope,
        "po_one",
        { startingAfter: "txn_old" },
      ),
    ).rejects.toMatchObject({ reason: "INVALID_CURSOR" });
    await expect(
      provider({}, 503).client.listPage(scope, "po_one"),
    ).rejects.toMatchObject({ reason: "UNAVAILABLE" });
  });
});
