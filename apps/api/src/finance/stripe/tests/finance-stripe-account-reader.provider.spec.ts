import { StripeFinanceAccountReader } from "../finance-stripe-account-reader.provider";

const account = {
  id: "acct_school",
  livemode: false,
  identity: { country: "gb" },
  configuration: {
    merchant: { capabilities: { card_payments: { status: "active" } } },
  },
};
const config = { mode: "test" as const, secretKey: "rk_test_servicing" };

describe("Finance servicing account reader", () => {
  it("retrieves current school identity with a read-only request and servicing key", async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(account)));
    expect(
      await new StripeFinanceAccountReader(config, fetcher).retrieveAccount(
        "acct_school",
      ),
    ).toEqual({
      id: "acct_school",
      livemode: false,
      country: "GB",
      cardPaymentsStatus: "active",
    });
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/v2/core/accounts/acct_school?"),
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        headers: expect.objectContaining({
          Authorization: "Bearer rk_test_servicing",
        }),
      }),
    );
  });

  it.each([
    { ...account, id: "acct_other" },
    { ...account, livemode: true },
  ])("rejects account or environment mismatch", async (payload) => {
    const fetcher = jest
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(payload)));
    await expect(
      new StripeFinanceAccountReader(config, fetcher).retrieveAccount(
        "acct_school",
      ),
    ).rejects.toThrow("unavailable");
  });

  it("does not request Stripe when servicing is disabled", async () => {
    const fetcher = jest.fn();
    await expect(
      new StripeFinanceAccountReader(
        { mode: "disabled" },
        fetcher,
      ).retrieveAccount("acct_school"),
    ).rejects.toThrow("unavailable");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
