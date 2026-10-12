// Plan catalogue derived from Option A spec (`pathway-buy-now-option-a.md`).
// Keep PlanCode values in sync with Subscription.planCode and Buy Now flow inputs.
export type PlanTier = "core" | "starter" | "growth" | "professional" | "enterprise";

export type PlanCode =
  | "CORE_MONTHLY"
  | "CORE_YEARLY"
  | "MINIMUM_MONTHLY" // Stripe alias for CORE_MONTHLY
  | "MINIMUM_YEARLY" // Stripe alias for CORE_YEARLY
  | "STARTER_MONTHLY"
  | "STARTER_YEARLY"
  | "GROWTH_MONTHLY"
  | "GROWTH_YEARLY"
  | "ENTERPRISE_CONTACT"
  // Phase 0 PR 0.2: new target-tier codes (price-tagged; existing codes above are
  // untouched and keep resolving for grandfathered subscribers, see PR 0.6).
  | "STARTER_49_MONTHLY"
  | "STARTER_49_YEARLY"
  | "GROWTH_99_MONTHLY"
  | "GROWTH_99_YEARLY"
  | "PROFESSIONAL_149_MONTHLY"
  | "PROFESSIONAL_149_YEARLY";

export type PlanDefinition = {
  code: PlanCode;
  tier: PlanTier;
  displayName: string;
  billingPeriod: "monthly" | "yearly" | "none";
  selfServe: boolean;
  av30Included: number | null;
  maxChildrenIncluded: number | null;
  storageGbIncluded: number | null;
  smsMessagesIncluded: number | null;
  leaderSeatsIncluded: number | null;
  maxSitesIncluded: number | null;
  /** Max active classes/groups per site. Null means no explicit cap. */
  maxActiveClasses: number | null;
  flags?: { canExceedAv30WithOverage?: boolean; enterpriseOnly?: boolean };
};

export const PLAN_CATALOGUE: Readonly<Record<PlanCode, PlanDefinition>> = {
  CORE_MONTHLY: {
    code: "CORE_MONTHLY",
    tier: "core",
    displayName: "Core",
    billingPeriod: "monthly",
    selfServe: true,
    av30Included: 15,
    maxChildrenIncluded: 50,
    storageGbIncluded: null,
    smsMessagesIncluded: null,
    leaderSeatsIncluded: null,
    maxSitesIncluded: 1,
    maxActiveClasses: null,
  },
  CORE_YEARLY: {
    code: "CORE_YEARLY",
    tier: "core",
    displayName: "Core",
    billingPeriod: "yearly",
    selfServe: true,
    av30Included: 15,
    maxChildrenIncluded: 50,
    storageGbIncluded: null,
    smsMessagesIncluded: null,
    leaderSeatsIncluded: null,
    maxSitesIncluded: 1,
    maxActiveClasses: null,
  },
  MINIMUM_MONTHLY: {
    code: "MINIMUM_MONTHLY",
    tier: "core",
    displayName: "Core",
    billingPeriod: "monthly",
    selfServe: true,
    av30Included: 15,
    maxChildrenIncluded: 50,
    storageGbIncluded: null,
    smsMessagesIncluded: null,
    leaderSeatsIncluded: null,
    maxSitesIncluded: 1,
    maxActiveClasses: null,
  },
  MINIMUM_YEARLY: {
    code: "MINIMUM_YEARLY",
    tier: "core",
    displayName: "Core",
    billingPeriod: "yearly",
    selfServe: true,
    av30Included: 15,
    maxChildrenIncluded: 50,
    storageGbIncluded: null,
    smsMessagesIncluded: null,
    leaderSeatsIncluded: null,
    maxSitesIncluded: 1,
    maxActiveClasses: null,
  },
  STARTER_MONTHLY: {
    code: "STARTER_MONTHLY",
    tier: "starter",
    displayName: "Starter",
    billingPeriod: "monthly",
    selfServe: true,
    av30Included: 50,
    maxChildrenIncluded: null,
    storageGbIncluded: null,
    smsMessagesIncluded: null,
    leaderSeatsIncluded: null,
    maxSitesIncluded: 1,
    maxActiveClasses: null,
  },
  STARTER_YEARLY: {
    code: "STARTER_YEARLY",
    tier: "starter",
    displayName: "Starter",
    billingPeriod: "yearly",
    selfServe: true,
    av30Included: 50,
    maxChildrenIncluded: null,
    storageGbIncluded: null,
    smsMessagesIncluded: null,
    leaderSeatsIncluded: null,
    maxSitesIncluded: 1,
    maxActiveClasses: null,
  },
  GROWTH_MONTHLY: {
    code: "GROWTH_MONTHLY",
    tier: "growth",
    displayName: "Growth",
    billingPeriod: "monthly",
    selfServe: true,
    av30Included: 200,
    maxChildrenIncluded: null,
    storageGbIncluded: null,
    smsMessagesIncluded: null,
    leaderSeatsIncluded: null,
    maxSitesIncluded: 3,
    maxActiveClasses: null,
  },
  GROWTH_YEARLY: {
    code: "GROWTH_YEARLY",
    tier: "growth",
    displayName: "Growth",
    billingPeriod: "yearly",
    selfServe: true,
    av30Included: 200,
    maxChildrenIncluded: null,
    storageGbIncluded: null,
    smsMessagesIncluded: null,
    leaderSeatsIncluded: null,
    maxSitesIncluded: 3,
    maxActiveClasses: null,
  },
  ENTERPRISE_CONTACT: {
    code: "ENTERPRISE_CONTACT",
    tier: "enterprise",
    displayName: "Enterprise (contact us)",
    billingPeriod: "none",
    selfServe: false,
    av30Included: null,
    maxChildrenIncluded: null,
    storageGbIncluded: null,
    smsMessagesIncluded: null,
    leaderSeatsIncluded: null,
    maxSitesIncluded: null,
    maxActiveClasses: null,
    flags: { enterpriseOnly: true },
  },
  // Phase 0 PR 0.2: new target-tier plan codes (£49/250, £99/750, £149/2,000).
  STARTER_49_MONTHLY: {
    code: "STARTER_49_MONTHLY",
    tier: "starter",
    displayName: "Starter",
    billingPeriod: "monthly",
    selfServe: true,
    av30Included: 250,
    maxChildrenIncluded: null,
    storageGbIncluded: null,
    smsMessagesIncluded: null,
    leaderSeatsIncluded: null,
    maxSitesIncluded: 1,
    maxActiveClasses: null,
  },
  STARTER_49_YEARLY: {
    code: "STARTER_49_YEARLY",
    tier: "starter",
    displayName: "Starter",
    billingPeriod: "yearly",
    selfServe: true,
    av30Included: 250,
    maxChildrenIncluded: null,
    storageGbIncluded: null,
    smsMessagesIncluded: null,
    leaderSeatsIncluded: null,
    maxSitesIncluded: 1,
    maxActiveClasses: null,
  },
  GROWTH_99_MONTHLY: {
    code: "GROWTH_99_MONTHLY",
    tier: "growth",
    displayName: "Growth",
    billingPeriod: "monthly",
    selfServe: true,
    av30Included: 750,
    maxChildrenIncluded: null,
    storageGbIncluded: null,
    smsMessagesIncluded: null,
    leaderSeatsIncluded: null,
    maxSitesIncluded: 2,
    maxActiveClasses: null,
  },
  GROWTH_99_YEARLY: {
    code: "GROWTH_99_YEARLY",
    tier: "growth",
    displayName: "Growth",
    billingPeriod: "yearly",
    selfServe: true,
    av30Included: 750,
    maxChildrenIncluded: null,
    storageGbIncluded: null,
    smsMessagesIncluded: null,
    leaderSeatsIncluded: null,
    maxSitesIncluded: 2,
    maxActiveClasses: null,
  },
  PROFESSIONAL_149_MONTHLY: {
    code: "PROFESSIONAL_149_MONTHLY",
    tier: "professional",
    displayName: "Professional",
    billingPeriod: "monthly",
    selfServe: true,
    av30Included: 2000,
    maxChildrenIncluded: null,
    storageGbIncluded: null,
    smsMessagesIncluded: null,
    leaderSeatsIncluded: null,
    maxSitesIncluded: 5,
    maxActiveClasses: null,
  },
  PROFESSIONAL_149_YEARLY: {
    code: "PROFESSIONAL_149_YEARLY",
    tier: "professional",
    displayName: "Professional",
    billingPeriod: "yearly",
    selfServe: true,
    av30Included: 2000,
    maxChildrenIncluded: null,
    storageGbIncluded: null,
    smsMessagesIncluded: null,
    leaderSeatsIncluded: null,
    maxSitesIncluded: 5,
    maxActiveClasses: null,
  },
};

export function getPlanDefinition(
  planCode: string | null | undefined,
): PlanDefinition | null {
  if (!planCode) return null;
  if (planCode in PLAN_CATALOGUE) {
    return PLAN_CATALOGUE[planCode as PlanCode];
  }
  return null;
}
