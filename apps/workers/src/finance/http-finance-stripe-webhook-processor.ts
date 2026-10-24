import type {
  ClaimedFinanceStripeWebhook,
  FinanceStripeWebhookProcessor,
} from "./finance-stripe-webhook.job";

export class HttpFinanceStripeWebhookProcessor implements FinanceStripeWebhookProcessor {
  constructor(
    private readonly baseUrl: URL,
    private readonly internalSecret: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    const localHttp =
      baseUrl.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1", "[::1]"].includes(baseUrl.hostname);
    if (
      !internalSecret ||
      (baseUrl.protocol !== "https:" && !localHttp) ||
      baseUrl.username ||
      baseUrl.password ||
      baseUrl.search ||
      baseUrl.hash
    ) {
      throw new Error(
        "Finance webhook processor requires an internal secret and HTTPS or local HTTP",
      );
    }
  }

  async process(
    event: ClaimedFinanceStripeWebhook,
    signal?: AbortSignal,
  ): Promise<"processed" | "deferred"> {
    const base = new URL(this.baseUrl);
    if (!base.pathname.endsWith("/")) base.pathname += "/";
    const url = new URL(
      `internal/finance/stripe-webhooks/${encodeURIComponent(event.id)}/process`,
      base,
    );
    const response = await this.fetcher(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-pathway-internal-secret": this.internalSecret,
      },
      body: JSON.stringify({
        tenantId: event.tenantId,
        orgId: event.orgId,
        claimToken: event.claimToken,
      }),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(20_000)])
        : AbortSignal.timeout(20_000),
      redirect: "error",
    });
    if (!response.ok) {
      throw new Error(
        `Finance Stripe webhook processor returned HTTP ${response.status}`,
      );
    }
    const result: unknown = await response.json();
    if (
      typeof result !== "object" ||
      result === null ||
      !("status" in result) ||
      (result.status !== "processed" && result.status !== "deferred")
    ) {
      throw new Error(
        "Finance Stripe webhook processor returned an invalid result",
      );
    }
    return result.status;
  }
}
