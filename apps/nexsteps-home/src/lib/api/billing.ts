import { apiClient } from "./http";

// Matches GET /billing/entitlements's real response shape
// (apps/api/src/billing/billing.controller.ts's getEntitlements) - field
// names mirrored exactly, not the plan brief's illustrative shortlist. Only
// the fields the membership screen actually renders are typed here; the
// rest of the real response (av30Cap, storageGbCap, smsMessagesCap, ...)
// is enforcement/usage data with no wireframe copy on this screen.
export type SubscriptionStatus = "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "INCOMPLETE";

export type Entitlements = {
  orgId: string;
  isMasterOrg: boolean;
  subscriptionStatus: SubscriptionStatus | "NONE";
  subscription: {
    planCode: string;
    status: SubscriptionStatus;
    periodStart: string;
    periodEnd: string;
    cancelAtPeriodEnd: boolean;
  } | null;
  maxChildren: number | null;
  leaderSeatsIncluded: number | null;
};

export function getEntitlements() {
  return apiClient.request<Entitlements>("/billing/entitlements");
}

export function createBillingPortalSession() {
  return apiClient.request<{ url: string }>("/billing/portal", { method: "POST" });
}
