import type {
  InstitutionalMappedQuote,
  InstitutionalQuoteLine,
  InstitutionalQuoteResult,
  InstitutionalMappedPlanCode,
  InstitutionalMappedQuoteLine,
  InstitutionalStorageChoice,
} from "@pathway/pricing";
import { API_BASE_URL, apiFetch } from "./api-client";
import { apiErrorFromResponse } from "./api-transport";

export type InstitutionalSummary = {
  orgId: string;
  currentPaid: {
    planCode: InstitutionalMappedPlanCode;
    periodStart: string;
    periodEnd: string;
    enrolledChildren: number | null;
    includedChildren: number | null;
    includedModules: string[];
    paidModules: string[];
    lines: (InstitutionalQuoteLine | InstitutionalMappedQuoteLine)[];
    subtotalPence: number | null;
    status: string;
  } | null;
  liveForecast: InstitutionalQuoteResult | InstitutionalMappedQuote | null;
  frozenRenewal: {
    planCode: InstitutionalMappedPlanCode;
    status: string;
    enrolledChildren: number | null;
    includedChildren: number | null;
    includedModules: string[];
    paidModules: string[];
    lines: (InstitutionalQuoteLine | InstitutionalMappedQuoteLine)[];
    subtotalPence: number | null;
    cutoffAt: string | null;
    effectiveAt: string | null;
  } | null;
  scheduledChange: {
    planCode: InstitutionalMappedPlanCode;
    includedModules: string[];
    paidModules: string[];
    acceptedAt: string | null;
    effectiveAt: string | null;
  } | null;
  nextCutoffAt: string | null;
  reviewReason: string | null;
  countSource: "VERIFIED" | "DECLARED" | null;
};

export type InstitutionalQuote = {
  id: string;
  planCode: InstitutionalMappedPlanCode;
  status: "PRICED" | "CONTACT_SALES" | "REVIEW_REQUIRED";
  enrolledChildren: number | null;
  includedChildren: number | null;
  includedModules: string[];
  paidModules: string[];
  subtotalPence: number | null;
  lines: (InstitutionalQuoteLine | InstitutionalMappedQuoteLine)[];
  expiresAt: string | null;
};

export type InstitutionalCatalogue = {
  currency: "GBP";
  plans: {
    planCode: InstitutionalMappedPlanCode;
    tier: "starter" | "growth" | "professional";
    interval: "month" | "year";
    includedChildren: number;
    includedSites: number;
    available: boolean;
    basePrice: InstitutionalMappedQuoteLine | null;
  }[];
};

export type DeclaredCapacityBillingSummary = {
  orgId: string;
  pricesIncludeVat: boolean;
  currentPaid: {
    planCode: string;
    periodStart: string;
    periodEnd: string;
    declaredCapacity: number | null;
    subtotalPence: number | null;
    status: string;
  } | null;
  scheduledChange: {
    declaredCapacity: number | null;
    acceptedAt: string | null;
    effectiveAt: string | null;
  } | null;
  pendingCapacityChange: {
    snapshotId: string;
    declaredCapacity: number | null;
    amountDueNowPence: number | null;
    status: string;
  } | null;
};

export type DeclaredCapacityCapacityQuote = {
  id: string;
  declaredCapacity: number;
  planCode: string;
  subtotalPence: number;
  amountDueNowPence: number | null;
  expiresAt: string;
  lines: {
    component: "BASE" | "DECLARED_CAPACITY" | "ADDON";
    priceCode: string;
    quantity: number;
    unitAmountPence: number;
    subtotalPence: number;
  }[];
};

export type CapacityQuoteAcceptance =
  | { kind: "scheduled_decrease"; acceptance: { effectiveAt: string | null } }
  | { kind: "active" }
  | {
      kind: "payment_pending";
      snapshotId: string;
      amountDueNowPence: number;
      paymentIntentClientSecret: string | null;
      publishableKey: string | null;
    };

export type DeclaredCapacityAddonTrial = {
  module: string;
  status: "SELECTED" | "ACTIVE" | "EXPIRED" | "DECLINED" | "CONVERTED";
  selectedAt: string;
  activatedAt: string | null;
  expiresAt: string | null;
  decisionRecorded: boolean;
};

export type DeclaredCapacityAddonTrials = {
  declaredCapacity: number;
  trialSlotLimit: number;
  consumedSlots: number;
  pendingSelections: number;
  remainingSlots: number;
  availableModules: string[];
  trials: DeclaredCapacityAddonTrial[];
};

export type DeclaredCapacityAddonPriceReview = {
  module: string;
  currency: "GBP";
  monthly: { amountPence: number };
  yearly: { amountPence: number };
};

async function read<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw await apiErrorFromResponse(
      response,
      "Institutional billing is unavailable. Please try again.",
    );
  }
  return response.json() as Promise<T>;
}

export async function fetchInstitutionalSummary(): Promise<InstitutionalSummary> {
  return read<InstitutionalSummary>(
    await apiFetch(`${API_BASE_URL}/billing/institutional/summary`, {
      cache: "no-store",
    }),
  );
}

export async function fetchDeclaredCapacityBillingSummary(): Promise<DeclaredCapacityBillingSummary> {
  return read<DeclaredCapacityBillingSummary>(
    await apiFetch(`${API_BASE_URL}/billing/institutional/summary`, {
      cache: "no-store",
    }),
  );
}

export async function createDeclaredCapacityCapacityQuote(
  declaredCapacity: number,
): Promise<DeclaredCapacityCapacityQuote> {
  return read<DeclaredCapacityCapacityQuote>(
    await apiFetch(`${API_BASE_URL}/billing/institutional/capacity/quotes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ declaredCapacity }),
    }),
  );
}

export async function acceptDeclaredCapacityCapacityQuote(
  snapshotId: string,
  idempotencyKey: string,
): Promise<CapacityQuoteAcceptance> {
  return read<CapacityQuoteAcceptance>(
    await apiFetch(
      `${API_BASE_URL}/billing/institutional/capacity/quotes/accept`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId, idempotencyKey }),
      },
    ),
  );
}

export async function fetchDeclaredCapacityAddonTrials(): Promise<DeclaredCapacityAddonTrials> {
  return read<DeclaredCapacityAddonTrials>(
    await apiFetch(`${API_BASE_URL}/billing/institutional/addons/trials`, {
      cache: "no-store",
    }),
  );
}

export async function selectDeclaredCapacityAddonTrial(
  module: string,
): Promise<void> {
  await read<unknown>(
    await apiFetch(
      `${API_BASE_URL}/billing/institutional/addons/trials/select`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module }),
      },
    ),
  );
}

export async function removeDeclaredCapacityAddonTrialSelection(
  module: string,
): Promise<void> {
  await read<unknown>(
    await apiFetch(
      `${API_BASE_URL}/billing/institutional/addons/trials/${encodeURIComponent(module)}`,
      { method: "DELETE" },
    ),
  );
}

export async function activateDeclaredCapacityAddonTrial(
  module: string,
): Promise<void> {
  await read<unknown>(
    await apiFetch(
      `${API_BASE_URL}/billing/institutional/addons/trials/${encodeURIComponent(module)}/activate`,
      { method: "POST" },
    ),
  );
}

export async function decideDeclaredCapacityAddonTrial(
  module: string,
  wantsPurchase: boolean,
): Promise<void> {
  await read<unknown>(
    await apiFetch(
      `${API_BASE_URL}/billing/institutional/addons/trials/${encodeURIComponent(module)}/decision`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wantsPurchase }),
      },
    ),
  );
}

export async function fetchDeclaredCapacityAddonPriceReview(
  module: string,
): Promise<DeclaredCapacityAddonPriceReview> {
  return read<DeclaredCapacityAddonPriceReview>(
    await apiFetch(
      `${API_BASE_URL}/billing/institutional/addons/trials/${encodeURIComponent(module)}/price-review`,
      { cache: "no-store" },
    ),
  );
}

export async function startDeclaredCapacityAddonCheckout(
  module: string,
  interval: "MONTHLY" | "YEARLY",
): Promise<{ checkoutUrl: string; trialId: string }> {
  return read<{ checkoutUrl: string; trialId: string }>(
    await apiFetch(
      `${API_BASE_URL}/billing/institutional/addons/trials/${encodeURIComponent(module)}/checkout`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval }),
      },
    ),
  );
}

export async function fetchInstitutionalCatalogue(): Promise<InstitutionalCatalogue> {
  return read<InstitutionalCatalogue>(
    await apiFetch(`${API_BASE_URL}/billing/institutional/catalogue/v2`, {
      cache: "no-store",
    }),
  );
}

export async function estimateInstitutionalQuote(
  planCode: InstitutionalMappedPlanCode,
  enrolledChildren: number,
  storageChoice: InstitutionalStorageChoice,
): Promise<InstitutionalMappedQuote> {
  return read<InstitutionalMappedQuote>(
    await apiFetch(
      `${API_BASE_URL}/billing/institutional/catalogue/v2/estimate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planCode, enrolledChildren, storageChoice }),
      },
    ),
  );
}

export async function createInstitutionalQuote(
  planCode: InstitutionalMappedPlanCode,
  storageChoice: InstitutionalStorageChoice,
  declaredChildren?: number,
): Promise<InstitutionalQuote> {
  return read<InstitutionalQuote>(
    await apiFetch(`${API_BASE_URL}/billing/institutional/quotes/v2`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planCode,
        storageChoice,
        includedModules: [],
        paidModules: [],
        ...(declaredChildren === undefined
          ? {}
          : { declaredChildren, declarationAccepted: true }),
      }),
    }),
  );
}

export async function checkoutInstitutionalQuote(
  snapshotId: string,
  idempotencyKey: string,
): Promise<{ checkoutUrl: string }> {
  return read<{ checkoutUrl: string }>(
    await apiFetch(`${API_BASE_URL}/billing/institutional/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshotId, idempotencyKey }),
    }),
  );
}

export async function acceptInstitutionalQuote(
  snapshotId: string,
  idempotencyKey: string,
): Promise<void> {
  await read<unknown>(
    await apiFetch(`${API_BASE_URL}/billing/institutional/quotes/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshotId, idempotencyKey }),
    }),
  );
}
