import {
  StripeFinanceConnectProvider,
  type StripeFinanceAccount,
} from "../finance-stripe-connect.provider";

describe("Stripe Finance Connect provider", () => {
  const config = {
    mode: "test" as const,
    secretKey: "sk_test_unit_fixture",
    returnUrl: "https://school.example/finance/stripe/return",
    refreshUrl: "https://school.example/finance/stripe/refresh",
  };

  afterEach(() => jest.restoreAllMocks());

  it("requests a school merchant account in the saved country with Stripe-owned fees and losses", async () => {
    const response = accountResponse("acct_test_school", "pending", "NL");
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(response);
    const provider = new StripeFinanceConnectProvider(config);

    const account = await provider.createAccount({
      legalEntityName: "NexSteps Test School",
      countryCode: "NL",
      connectionId: "connection-fixture",
      idempotencyKey: "finance-connect-connection-fixture",
    });

    expect(account).toEqual<StripeFinanceAccount>({
      id: "acct_test_school",
      livemode: false,
      country: "NL",
      cardPaymentsStatus: "pending",
    });
    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.stripe.com/v2/core/accounts");
    expect(request?.method).toBe("POST");
    expect(new Headers(request?.headers).get("Stripe-Version")).toBe(
      "2026-09-30.endive",
    );
    expect(new Headers(request?.headers).get("Idempotency-Key")).toBe(
      "finance-connect-connection-fixture",
    );
    if (!request || typeof request.body !== "string") {
      throw new Error("Stripe account request body is missing");
    }
    const body: unknown = JSON.parse(request.body);
    expect(body).toMatchObject({
      identity: {
        country: "nl",
        entity_type: "company",
        business_details: { registered_name: "NexSteps Test School" },
      },
      configuration: {
        merchant: { capabilities: { card_payments: { requested: true } } },
      },
      defaults: {
        responsibilities: {
          fees_collector: "stripe",
          losses_collector: "stripe",
        },
      },
      dashboard: "full",
      metadata: { finance_connection_id: "connection-fixture" },
    });
  });

  it("creates hosted onboarding links without persisting them", async () => {
    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          url: "https://accounts.stripe.com/r/acct_test_school#one-time",
          expires_at: "2026-10-17T18:00:00.000Z",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const provider = new StripeFinanceConnectProvider(config);

    const link = await provider.createOnboardingLink({
      accountId: "acct_test_school",
      idempotencyKey: "one-time-link-fixture",
    });

    expect(link).toEqual({
      url: "https://accounts.stripe.com/r/acct_test_school#one-time",
      expiresAt: "2026-10-17T18:00:00.000Z",
    });
    const request = fetchMock.mock.calls[0]?.[1];
    if (!request || typeof request.body !== "string") {
      throw new Error("Stripe account link request body is missing");
    }
    const body: unknown = JSON.parse(request.body);
    expect(body).toMatchObject({
      account: "acct_test_school",
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          return_url: config.returnUrl,
          refresh_url: config.refreshUrl,
        },
      },
    });
    expect(body).not.toHaveProperty(
      "use_case.account_onboarding.configurations",
    );
  });

  it("rejects non-Stripe onboarding URLs and provider failures", async () => {
    jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          url: "https://attacker.example/steal",
          expires_at: "2026-10-17T18:00:00.000Z",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const provider = new StripeFinanceConnectProvider(config);
    await expect(
      provider.createOnboardingLink({
        accountId: "acct_test_school",
        idempotencyKey: "one-time-link-fixture",
      }),
    ).rejects.toThrow("Stripe connection is unavailable");
  });
});

function accountResponse(
  accountId: string,
  cardStatus: string,
  countryCode = "GB",
): Response {
  return new Response(
    JSON.stringify({
      id: accountId,
      livemode: false,
      identity: { country: countryCode.toLowerCase() },
      configuration: {
        merchant: { capabilities: { card_payments: { status: cardStatus } } },
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}
