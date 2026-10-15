import type { InstitutionalVertical } from "@pathway/types";
import type {
  InstitutionalMappedPlanCode,
  InstitutionalMappedQuote,
  InstitutionalMappedQuoteLine,
  InstitutionalStorageChoice,
} from "@pathway/pricing";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";

export type InstitutionalCataloguePlan = {
  planCode: InstitutionalMappedPlanCode;
  tier: "starter" | "growth" | "professional";
  interval: "month" | "year";
  includedChildren: number;
  includedModuleSlots: number;
  includedSites: number;
  available: boolean;
  basePrice: InstitutionalMappedQuoteLine | null;
};

export type InstitutionalCatalogue = {
  pricingVersion: "ENROLLED_CHILDREN_V2";
  currency: "GBP";
  plans: InstitutionalCataloguePlan[];
};

export type PublicInstitutionalCheckoutInput = {
  planCode: InstitutionalMappedPlanCode;
  enrolledChildren: number;
  declarationAccepted: true;
  setting: InstitutionalVertical;
  storageChoice: InstitutionalStorageChoice;
  includedModules: [];
  paidModules: [];
  idempotencyKey: string;
  org: {
    orgName: string;
    contactName: string;
    contactEmail: string;
    password: string;
  };
};

async function read<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(
      response.status === 503
        ? "A selected price is temporarily unavailable. Please retry in a moment."
        : response.status === 409
          ? "This checkout can no longer be used. Review your choices and try again."
          : "Institutional billing is unavailable. Please try again.",
    );
  }
  return response.json() as Promise<T>;
}

export async function fetchInstitutionalCatalogue(
  signal?: AbortSignal,
): Promise<InstitutionalCatalogue> {
  return read<InstitutionalCatalogue>(
    await fetch(`${apiBaseUrl}/billing/institutional/catalogue/v2`, {
      cache: "no-store",
      signal,
    }),
  );
}

export async function estimateInstitutionalPrice(
  planCode: InstitutionalMappedPlanCode,
  enrolledChildren: number,
  storageChoice: InstitutionalStorageChoice,
  signal?: AbortSignal,
): Promise<InstitutionalMappedQuote> {
  return read<InstitutionalMappedQuote>(
    await fetch(`${apiBaseUrl}/billing/institutional/catalogue/v2/estimate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planCode, enrolledChildren, storageChoice }),
      signal,
    }),
  );
}

export async function startPublicInstitutionalCheckout(
  input: PublicInstitutionalCheckoutInput,
): Promise<{ checkoutUrl: string; pendingOrderId: string }> {
  return read<{ checkoutUrl: string; pendingOrderId: string }>(
    await fetch(`${apiBaseUrl}/billing/institutional/public/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}
