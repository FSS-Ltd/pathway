import type { InstitutionalVertical } from "@pathway/types";
import type {
  DeclaredCapacityInterval,
  DeclaredCapacityPlanCode,
  InstitutionalMappedPlanCode,
  InstitutionalMappedQuote,
  InstitutionalMappedQuoteLine,
  InstitutionalStorageChoice,
} from "@pathway/pricing";
import type { WebModule } from "./module-catalog";

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

export type DeclaredCapacityAddonModule = Exclude<WebModule, "AI_WORKSPACE">;

export type DeclaredCapacityAddonOption = {
  module: DeclaredCapacityAddonModule;
  trialAvailable: boolean;
  monthlyPricePence: number | null;
  yearlyPricePence: number | null;
};

export type DeclaredCapacityCatalogue = {
  pricingVersion: "DECLARED_CAPACITY_V2";
  currency: "GBP";
  pricesIncludeVat: boolean;
  intervals: readonly ["month", "year"];
  plans: {
    tier: "starter" | "growth" | "professional";
    minimumCapacity: number;
    siteAllowance: number;
    trialModuleSlots: number;
    includedPaidModules: readonly never[];
  }[];
  storageOptions: {
    choice: InstitutionalStorageChoice;
    monthlyPricePence: number | null;
    yearlyPricePence: number | null;
  }[];
  enterprise: { minimumCapacity: 251; contactPath: "/demo?plan=enterprise" };
  addonOptions: DeclaredCapacityAddonOption[];
};

export type DeclaredCapacityEstimateLine = {
  component: "BASE" | "DECLARED_CAPACITY" | "ADDON" | "STORAGE";
  priceCode: string;
  quantity: number;
  unitAmountPence: number;
  subtotalPence: number;
};

export type DeclaredCapacityEstimate =
  | {
      kind: "priced";
      pricingVersion: "DECLARED_CAPACITY_V2";
      planCode: DeclaredCapacityPlanCode;
      tier: "starter" | "growth" | "professional";
      declaredCapacity: number;
      interval: DeclaredCapacityInterval;
      storageChoice: InstitutionalStorageChoice;
      currency: "GBP";
      pricesIncludeVat: boolean;
      siteAllowance: number;
      trialModuleSlots: number;
      includedPaidModules: readonly never[];
      lines: DeclaredCapacityEstimateLine[];
      paidModules: DeclaredCapacityAddonModule[];
      trialModules: DeclaredCapacityAddonModule[];
      subtotalPence: number;
    }
  | {
      kind: "contact_sales";
      pricingVersion: "DECLARED_CAPACITY_V2";
      tier: "enterprise";
      declaredCapacity: number;
      interval: DeclaredCapacityInterval;
      pricesIncludeVat: boolean;
      siteAllowance: null;
      contactPath: "/demo?plan=enterprise";
    };

export type PublicDeclaredCapacityCheckoutInput = {
  declaredCapacity: number;
  interval: DeclaredCapacityInterval;
  expectedTotalPence: number;
  declarationAccepted: true;
  setting: InstitutionalVertical;
  storageChoice: InstitutionalStorageChoice;
  payNowModules: DeclaredCapacityAddonModule[];
  trialModules: DeclaredCapacityAddonModule[];
  idempotencyKey: string;
  org: {
    orgName: string;
    contactName: string;
    contactEmail: string;
    password: string;
  };
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

export async function fetchDeclaredCapacityCatalogue(
  signal?: AbortSignal,
): Promise<DeclaredCapacityCatalogue> {
  const catalogue = await read<DeclaredCapacityCatalogue>(
    await fetch(
      `${apiBaseUrl}/billing/institutional/catalogue/declared-capacity`,
      {
        cache: "no-store",
        signal,
      },
    ),
  );
  if (!Array.isArray(catalogue.storageOptions)) {
    throw new Error(
      "Storage pricing is unavailable. Please retry in a moment.",
    );
  }
  return catalogue;
}

export async function estimateDeclaredCapacityPrice(
  declaredCapacity: number,
  interval: DeclaredCapacityInterval,
  selections: Pick<
    PublicDeclaredCapacityCheckoutInput,
    "payNowModules" | "trialModules" | "storageChoice"
  >,
  signal?: AbortSignal,
): Promise<DeclaredCapacityEstimate> {
  const estimate = await read<DeclaredCapacityEstimate>(
    await fetch(
      `${apiBaseUrl}/billing/institutional/catalogue/declared-capacity/estimate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ declaredCapacity, interval, ...selections }),
        signal,
      },
    ),
  );
  if (
    estimate.kind === "priced" &&
    estimate.storageChoice !== selections.storageChoice
  ) {
    throw new Error(
      "Storage pricing is unavailable. Please retry in a moment.",
    );
  }
  return estimate;
}

export async function startPublicDeclaredCapacityCheckout(
  input: PublicDeclaredCapacityCheckoutInput,
): Promise<{ checkoutUrl: string; pendingOrderId: string }> {
  return read<{ checkoutUrl: string; pendingOrderId: string }>(
    await fetch(
      `${apiBaseUrl}/billing/institutional/public/declared-capacity/checkout`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    ),
  );
}
