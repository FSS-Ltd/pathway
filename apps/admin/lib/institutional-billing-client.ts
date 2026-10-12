import type {
  InstitutionalPlanCode,
  InstitutionalQuoteLine,
  InstitutionalQuoteResult,
} from "@pathway/pricing";
import { API_BASE_URL, apiFetch } from "./api-client";
import { apiErrorFromResponse } from "./api-transport";

export type InstitutionalSummary = {
  currentPaid: {
    planCode: InstitutionalPlanCode;
    periodStart: string;
    periodEnd: string;
    enrolledChildren: number | null;
    includedChildren: number | null;
    includedModules: string[];
    paidModules: string[];
    lines: InstitutionalQuoteLine[];
    subtotalPence: number | null;
    status: string;
  } | null;
  liveForecast: InstitutionalQuoteResult | null;
  frozenRenewal: {
    planCode: InstitutionalPlanCode;
    status: string;
    enrolledChildren: number | null;
    includedChildren: number | null;
    includedModules: string[];
    paidModules: string[];
    lines: InstitutionalQuoteLine[];
    subtotalPence: number | null;
    cutoffAt: string | null;
    effectiveAt: string | null;
  } | null;
  scheduledChange: {
    planCode: InstitutionalPlanCode;
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
  planCode: InstitutionalPlanCode;
  status: "PRICED" | "CONTACT_SALES" | "REVIEW_REQUIRED";
  enrolledChildren: number | null;
  includedChildren: number | null;
  includedModules: string[];
  paidModules: string[];
  subtotalPence: number | null;
  expiresAt: string | null;
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

export async function createInstitutionalQuote(
  planCode: InstitutionalPlanCode,
): Promise<InstitutionalQuote> {
  return read<InstitutionalQuote>(
    await apiFetch(`${API_BASE_URL}/billing/institutional/quotes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planCode, includedModules: [], paidModules: [] }),
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
