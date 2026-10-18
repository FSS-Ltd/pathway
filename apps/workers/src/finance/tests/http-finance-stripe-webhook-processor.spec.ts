import { HttpFinanceStripeWebhookProcessor } from "../http-finance-stripe-webhook-processor";

const event = {
  id: "row-123",
  tenantId: "tenant-a",
  orgId: "org-a",
  claimToken: "00000000-0000-4000-8000-000000000001",
  attempts: 1,
};

describe("HttpFinanceStripeWebhookProcessor", () => {
  it("posts only the claimed event identity to the protected internal endpoint", async () => {
    const fetcher = jest
      .fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>()
      .mockResolvedValue(
        new Response(JSON.stringify({ status: "processed" }), { status: 200 }),
      );
    const processor = new HttpFinanceStripeWebhookProcessor(
      new URL("https://api.example.test/"),
      "internal-secret",
      fetcher,
    );

    await expect(processor.process(event)).resolves.toBe("processed");
    expect(fetcher).toHaveBeenCalledWith(
      new URL(
        "https://api.example.test/internal/finance/stripe-webhooks/row-123/process",
      ),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-pathway-internal-secret": "internal-secret",
        }),
        body: JSON.stringify({
          tenantId: "tenant-a",
          orgId: "org-a",
          claimToken: event.claimToken,
        }),
      }),
    );
  });

  it("rejects a malformed internal response so the lease is retried", async () => {
    const fetcher = jest
      .fn<Promise<Response>, [RequestInfo | URL, RequestInit?]>()
      .mockResolvedValue(
        new Response(JSON.stringify({ status: "success" }), { status: 200 }),
      );
    const processor = new HttpFinanceStripeWebhookProcessor(
      new URL("https://api.example.test/"),
      "internal-secret",
      fetcher,
    );

    await expect(processor.process(event)).rejects.toThrow(
      "returned an invalid result",
    );
  });

  it("requires HTTPS outside localhost and an internal secret", () => {
    expect(
      () =>
        new HttpFinanceStripeWebhookProcessor(
          new URL("http://api.example.test/"),
          "internal-secret",
        ),
    ).toThrow("requires an internal secret and HTTPS or local HTTP");
    expect(
      () =>
        new HttpFinanceStripeWebhookProcessor(
          new URL("https://api.example.test/"),
          "",
        ),
    ).toThrow("requires an internal secret and HTTPS or local HTTP");
  });
});
