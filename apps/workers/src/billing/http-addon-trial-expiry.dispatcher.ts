import type { AddonTrialExpiryDispatcher } from "./expire-addon-trials.job";

export class HttpAddonTrialExpiryDispatcher implements AddonTrialExpiryDispatcher {
  constructor(
    private readonly baseUrl: URL,
    private readonly internalSecret: string,
  ) {
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
    if (!internalSecret) throw new Error("INTERNAL_AUTH_SECRET is required");
  }

  async expireForOrg(orgId: string): Promise<void> {
    const base = new URL(this.baseUrl);
    if (!base.pathname.endsWith("/")) base.pathname += "/";
    const url = new URL("billing/institutional/internal/addons/expire", base);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-pathway-internal-secret": this.internalSecret,
      },
      body: JSON.stringify({ orgId }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new Error(
        `Add-on trial expiry dispatch failed (HTTP ${response.status})`,
      );
    }
  }
}
