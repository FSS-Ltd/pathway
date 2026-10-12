import {
  BillingOperationReviewError,
  type BillingOperationExecutor,
} from "./billing-worker.job";

export class HttpBillingOperationExecutor implements BillingOperationExecutor {
  constructor(
    private readonly baseUrl: URL,
    private readonly internalSecret: string,
  ) {
    if (!internalSecret) throw new Error("INTERNAL_AUTH_SECRET is required");
    const localHttp =
      baseUrl.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1", "[::1]"].includes(baseUrl.hostname);
    if (
      (baseUrl.protocol !== "https:" && !localHttp) ||
      baseUrl.username ||
      baseUrl.password
    ) {
      throw new Error("BILLING_INTERNAL_API_URL must use HTTPS or local HTTP");
    }
  }

  async execute(operationId: string): Promise<void> {
    const base = new URL(this.baseUrl);
    if (!base.pathname.endsWith("/")) base.pathname += "/";
    const url = new URL(
      `billing/institutional/internal/operations/${encodeURIComponent(operationId)}`,
      base,
    );
    const response = await fetch(url, {
      method: "POST",
      headers: { "x-pathway-internal-secret": this.internalSecret },
      signal: AbortSignal.timeout(20_000),
    });
    if (response.ok) return;
    if ([400, 404, 409, 422].includes(response.status)) {
      throw new BillingOperationReviewError(
        `Billing operation requires review (HTTP ${response.status})`,
      );
    }
    throw new Error(
      `Billing operation dispatch failed (HTTP ${response.status})`,
    );
  }
}
