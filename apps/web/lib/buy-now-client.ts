/**
 * Client for the public Buy Now API surface.
 *
 * The backend creates a PendingOrder, starts Stripe Checkout, and relies on the
 * Stripe snapshot webhook to update subscriptions/entitlements. The frontend
 * should not manage subscription state directly; admins rely on /billing/entitlements.
 *
 * STRIPE_PUBLISHABLE_KEY is available for future UI work (e.g. Elements or
 * customer portal), but for now we only redirect to Stripe-hosted Checkout.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";

export type Sector = "CHURCH" | "CLUB" | "SCHOOL" | "CHARITY";

export const SECTOR_OPTIONS: { value: Sector; label: string }[] = [
  { value: "CHURCH", label: "Church" },
  { value: "CLUB", label: "Club" },
  { value: "SCHOOL", label: "School" },
  { value: "CHARITY", label: "Charity" },
];

export type PlanPreviewResponse = {
  planCode: string;
  planTier: "core" | "starter" | "growth" | "enterprise" | null;
  displayName: string | null;
  billingPeriod: "monthly" | "yearly" | "none" | null;
  selfServe: boolean | null;
  base: {
    av30Cap: number | null;
    maxChildren: number | null;
    storageGbCap: number | null;
    smsMessagesCap: number | null;
    leaderSeatsIncluded: number | null;
    maxSites: number | null;
  };
  addons: PlanPreviewResponse["base"] & {
    rawAddons?: {
      extraAv30Blocks?: number;
      extraStorageGb?: number;
      extraSmsMessages?: number;
      extraLeaderSeats?: number;
      extraSites?: number;
    };
    extraAv30Blocks?: number | null;
  };
  effectiveCaps: PlanPreviewResponse["base"];
  notes: { source: string; warnings: string[] };
};

export type BuyNowCheckoutPayload = {
  planCode: string;
  billingPeriod: "monthly" | "yearly";
  av30AddonBlocks25?: number;
  av30AddonBlocks50?: number;
  storageAddon100Gb?: number;
  storageAddon200Gb?: number;
  storageAddon1Tb?: number;
  smsBundles1000?: number;
  orgName: string;
  contactName: string;
  contactEmail: string;
  password: string;
  sector: Sector;
  successUrl?: string;
  cancelUrl?: string;
};

export type PublicBillingPrices = {
  provider: "stripe" | "fake";
  prices: {
    code: string;
    priceId: string;
    currency: string;
    unitAmount: number;
    interval: "month" | "year" | null;
    intervalCount: number | null;
    productName?: string | null;
    description?: string | null;
  }[];
  warnings?: string[];
};

export async function previewPlanSelection(
  input: {
    planCode: string;
    addons: {
      extraAv30Blocks?: number;
      extraStorageGb?: number;
      extraSmsMessages?: number;
      extraLeaderSeats?: number;
      extraSites?: number;
    };
  },
  options?: { signal?: AbortSignal },
): Promise<PlanPreviewResponse> {
  const res = await fetch(`${API_BASE_URL}/billing/plan-preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      planCode: input.planCode,
      addons: input.addons,
    }),
    cache: "no-store",
    signal: options?.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || "Unable to load plan preview");
  }

  return (await res.json()) as PlanPreviewResponse;
}

export async function createCheckoutSession(
  payload: BuyNowCheckoutPayload,
): Promise<{
  sessionId: string;
  sessionUrl: string;
  warnings?: string[];
}> {
  const av30Blocks25 = Math.max(0, Math.trunc(payload.av30AddonBlocks25 ?? 0));
  const av30Blocks50 = Math.max(0, Math.trunc(payload.av30AddonBlocks50 ?? 0));
  const av30AddonBlocks = av30Blocks25 + av30Blocks50 * 2; // backend block size = 25

  const body = {
    plan: {
      planCode: payload.planCode,
      av30AddonBlocks,
      extraStorageGb:
        (payload.storageAddon100Gb ?? 0) * 100 +
        (payload.storageAddon200Gb ?? 0) * 200 +
        (payload.storageAddon1Tb ?? 0) * 1000,
      extraSmsMessages: (payload.smsBundles1000 ?? 0) * 1000,
    },
    org: {
      orgName: payload.orgName,
      contactName: payload.contactName,
      contactEmail: payload.contactEmail,
      password: payload.password,
      sector: payload.sector,
    },
    successUrl: payload.successUrl,
    cancelUrl: payload.cancelUrl,
  };

  const res = await fetch(`${API_BASE_URL}/billing/buy-now/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || "We couldn’t start checkout just now.");
  }

  const json = (await res.json()) as {
    sessionId: string;
    sessionUrl: string;
    warnings?: string[];
  };

  return {
    sessionId: json.sessionId,
    sessionUrl: json.sessionUrl,
    warnings: json.warnings ?? [],
  };
}

export async function fetchPublicBillingPrices(): Promise<PublicBillingPrices> {
  const res = await fetch(`${API_BASE_URL}/billing/prices`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to load billing prices: ${res.status} ${body || res.statusText}`,
    );
  }

  return (await res.json()) as PublicBillingPrices;
}
