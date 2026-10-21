import { StripeFinanceReportingProvider } from "../finance-stripe-reporting.provider";

describe("Stripe Finance reporting provider", () => {
  it("uses the connected account, paginates all activity, and groups exact fees by currency", async () => {
    const requests: Array<{ url: URL; headers: Headers }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const headers = new Headers(init?.headers);
      requests.push({ url, headers });

      if (url.pathname.endsWith("/balance_transactions")) {
        if (!url.searchParams.has("starting_after")) {
          return jsonResponse({
            data: [
              {
                id: "txn_eur_1",
                amount: 1000,
                fee: 25,
                currency: "eur",
                created: 1792713600,
                type: "charge",
              },
            ],
            has_more: true,
          });
        }
        return jsonResponse({
          data: [
            {
              id: "txn_eur_2",
              amount: 2000,
              fee: 50,
              currency: "eur",
              created: 1792713601,
              type: "charge",
            },
            {
              id: "txn_gbp_1",
              amount: 3000,
              fee: -10,
              currency: "gbp",
              created: 1792713602,
              type: "fee_adjustment",
            },
          ],
          has_more: false,
        });
      }

      return jsonResponse({
        data: [
          {
            id: "po_test_1",
            amount: 950,
            currency: "eur",
            created: 1792713600,
            arrival_date: 1792800000,
            status: "paid",
            balance_transaction: "txn_payout_1",
          },
        ],
        has_more: false,
      });
    };
    const provider = new StripeFinanceReportingProvider(
      "sk_test_fixture",
      fetcher,
      () => new Date("2026-10-23T12:00:00.000Z"),
    );

    const result = await provider.listReportActivity("acct_school_test", {
      from: new Date("2026-10-23T00:00:00.000Z"),
      to: new Date("2026-10-24T00:00:00.000Z"),
    });

    expect(result).toEqual({
      fetchedAt: "2026-10-23T12:00:00.000Z",
      feesByCurrency: [
        { currency: "EUR", amountMinor: "75" },
        { currency: "GBP", amountMinor: "-10" },
      ],
      payouts: [
        {
          id: "po_test_1",
          amountMinor: "950",
          currency: "EUR",
          createdAt: new Date(1792713600 * 1000).toISOString(),
          arrivalAt: new Date(1792800000 * 1000).toISOString(),
          status: "paid",
          balanceTransactionId: "txn_payout_1",
        },
      ],
    });
    expect(requests).toHaveLength(3);
    for (const request of requests) {
      expect(request.headers.get("Stripe-Account")).toBe("acct_school_test");
      expect(request.headers.get("Authorization")).toBe(
        "Bearer sk_test_fixture",
      );
      expect(request.url.searchParams.get("created[gte]")).toBe("1792713600");
      expect(request.url.searchParams.get("created[lt]")).toBe("1792800000");
    }
    expect(
      requests
        .find(
          (request) =>
            request.url.pathname.endsWith("/balance_transactions") &&
            request.url.searchParams.has("starting_after"),
        )
        ?.url.searchParams.get("starting_after"),
    ).toBe("txn_eur_1");
  });

  it("rejects incomplete provider pagination instead of returning partial fees", async () => {
    const fetcher: typeof fetch = async () =>
      jsonResponse({ data: [], has_more: true });
    const provider = new StripeFinanceReportingProvider(
      "sk_test_fixture",
      fetcher,
    );

    await expect(
      provider.listReportActivity("acct_school_test", {
        from: new Date("2026-10-23T00:00:00.000Z"),
        to: new Date("2026-10-24T00:00:00.000Z"),
      }),
    ).rejects.toThrow("Connected Stripe report data is unavailable");
  });
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
