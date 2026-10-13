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
