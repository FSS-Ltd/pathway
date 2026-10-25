import { randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { CheckoutDto } from "./dto/checkout.dto";

export interface CheckoutResult {
  provider: "stripe";
  // URL the client should be redirected to (if hosted checkout is used)
  checkoutUrl?: string;
  // Provider-specific IDs for follow-up (e.g., sessionId, customerId, subscriptionId)
  sessionId?: string;
  customerId?: string;
  subscriptionId?: string;
  // Echo input for auditing (restricted to non-sensitive fields)
  planCode: string;
  mode: "subscription" | "setup";
}

/**
 * Narrow provider interface so we can swap Stripe later without changing our service
 */
interface BillingProvider {
  checkout(input: CheckoutDto): Promise<CheckoutResult>;
  // Additional operations we may implement later:
  // createCustomer?(args: { orgId: string; email?: string }): Promise<{ customerId: string }>;
  // startSubscription?(args: { orgId: string; planCode: string }): Promise<{ subscriptionId: string }>;
}

/**
 * Minimal stub provider. Replace with a real Stripe adapter later.
 * Never handles raw card data; only opaque IDs/tokens from the client.
 */
class StripeStubAdapter implements BillingProvider {
  async checkout(input: CheckoutDto): Promise<CheckoutResult> {
    const fakeId = `sess_${randomBytes(8).toString("hex")}`;

    // Build a safe redirect URL derived from successUrl
    const url = new URL(input.successUrl);
    url.searchParams.set("session", fakeId);
    url.searchParams.set("provider", "stripe");
    url.searchParams.set("mode", input.mode ?? "subscription");

    // In a real adapter, you'd call Stripe's SDK here and capture:
    // - sessionId
    // - (optionally) customerId
    // - (optionally) subscriptionId
    return {
      provider: "stripe",
      checkoutUrl: url.toString(),
      sessionId: fakeId,
      planCode: input.planCode,
      mode: input.mode ?? "subscription",
    };
  }
}

@Injectable()
export class BillingService {
  // For MVP we keep an internal stub. Later we can inject a real adapter via module providers.
  private readonly provider: BillingProvider = new StripeStubAdapter();

  /**
   * Create a hosted checkout (or setup) session with the billing provider.
   * Returns a redirect URL and session id to continue the flow on the client.
   *
   * Security:
   * - Never log or return secrets; we only accept opaque tokens/ids.
   * - Provider credentials are handled inside the adapter via env variables (once implemented).
   */
  async checkout(input: CheckoutDto): Promise<CheckoutResult> {
    // Basic invariant: orgId is a UUID (enforced by DTO), URLs are validated in DTO.
    // Any provider-specific mapping is done in the adapter.
    return this.provider.checkout(input);
  }
}
