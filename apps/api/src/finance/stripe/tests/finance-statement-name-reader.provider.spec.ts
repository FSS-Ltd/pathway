import { ServiceUnavailableException } from "@nestjs/common";
import { StripeFinanceStatementNameReader } from "../finance-statement-name-reader.provider";

const payload = {
  id: "acct_school_a",
  livemode: false,
  dashboard: "full",
  identity: { country: "gb" },
  configuration: {
    merchant: {
      statement_descriptor: { descriptor: "EXAMPLE SCHOOL", prefix: "EXAMPLE" },
    },
  },
};
describe("StripeFinanceStatementNameReader", () => {
  const config = { mode: "test" as const, secretKey: "sk_test_fixture" };
  it("requests included merchant settings without a write or cross-account header", async () => {
    const fetcher = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(Response.json(payload));
    const reader = new StripeFinanceStatementNameReader(config, fetcher);
    await expect(reader.retrieve("acct_school_a")).resolves.toMatchObject({
      id: "acct_school_a",
      country: "GB",
      descriptor: "EXAMPLE SCHOOL",
      dashboard: "full",
    });
    const [url, init] = fetcher.mock.calls[0];
    expect(new URL(String(url)).searchParams.get("include[0]")).toBe(
      "configuration.merchant",
    );
    expect(init).toMatchObject({ method: "GET", cache: "no-store" });
    expect(init?.body).toBeUndefined();
    expect(init?.headers).not.toHaveProperty("Stripe-Account");
  });
  it.each([
    { ...payload, id: "acct_other" },
    { ...payload, livemode: true },
    { ...payload, configuration: { merchant: null } },
    {
      ...payload,
      configuration: {
        merchant: { statement_descriptor: { descriptor: 12, prefix: null } },
      },
    },
  ])("rejects invalid or mismatched provider evidence", async (value) => {
    const fetcher = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(Response.json(value));
    await expect(
      new StripeFinanceStatementNameReader(config, fetcher).retrieve(
        "acct_school_a",
      ),
    ).rejects.toThrow(ServiceUnavailableException);
  });
  it("supports an unset provider descriptor without inventing a name", async () => {
    const fetcher = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(
        Response.json({
          ...payload,
          configuration: { merchant: { statement_descriptor: null } },
        }),
      );
    await expect(
      new StripeFinanceStatementNameReader(config, fetcher).retrieve(
        "acct_school_a",
      ),
    ).resolves.toMatchObject({ descriptor: null });
  });
  it("accepts a descriptor when Stripe omits its unused shortened prefix", async () => {
    const fetcher = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(
        Response.json({
          ...payload,
          configuration: {
            merchant: {
              statement_descriptor: { descriptor: "EXAMPLE SCHOOL" },
            },
          },
        }),
      );
    await expect(
      new StripeFinanceStatementNameReader(config, fetcher).retrieve(
        "acct_school_a",
      ),
    ).resolves.toMatchObject({ descriptor: "EXAMPLE SCHOOL" });
  });
  it("does not request disabled or invalid account configurations", async () => {
    const fetcher = jest.fn<
      ReturnType<typeof fetch>,
      Parameters<typeof fetch>
    >();
    await expect(
      new StripeFinanceStatementNameReader(
        { mode: "disabled" },
        fetcher,
      ).retrieve("acct_school_a"),
    ).rejects.toThrow(ServiceUnavailableException);
    await expect(
      new StripeFinanceStatementNameReader(config, fetcher).retrieve(
        "../../accounts",
      ),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("sanitises provider failures", async () => {
    const fetcher = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(
        Response.json(
          { error: { message: "private provider details" } },
          { status: 403 },
        ),
      );
    await expect(
      new StripeFinanceStatementNameReader(config, fetcher).retrieve(
        "acct_school_a",
      ),
    ).rejects.toThrow("School statement name is unavailable");
  });
});
