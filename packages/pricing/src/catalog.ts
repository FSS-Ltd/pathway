import type { PlanCode, PlanDefinition, PlanTier, PricingFaq } from "./types";

/**
 * Single source of truth for Nexsteps pricing plans.
 * Plan codes align with apps/api/src/billing/billing-plans.ts to prevent drift.
 */
export const PLANS: Readonly<Record<PlanCode, PlanDefinition>> = {
  CORE_MONTHLY: {
    code: "CORE_MONTHLY",
    tier: "core",
    displayName: "Core",
    tagline: "Starter essentials for smaller teams",
    billingPeriod: "monthly",
    pricePerMonth: 49.99,
    currency: "GBP",
    selfServe: true,
    av30Included: 15,
    maxChildrenIncluded: 50,
    maxSitesIncluded: 1,
    features: [
      "Up to 15 active staff and volunteers",
      "Up to 50 children",
      "1 site",
      "Attendance tracking",
      "Rota and timetable management",
      "Safeguarding notes and concerns",
      "Parent communication",
      "Mobile app access",
      "Standard reporting",
      "GDPR-compliant data handling",
    ],
    addons: [
      {
        label: "Storage",
        description: "Additional storage available (100GB, 200GB, or 1TB packs)",
      },
    ],
    doesNotInclude: ["Capacity add-ons (extra staff and site capacity)"],
    upgradeWhen:
      "You need higher staff capacity, more children capacity, or multi-site support.",
    bestFor: "Organisations that need Starter workflows at a smaller operating size.",
  },
  CORE_YEARLY: {
    code: "CORE_YEARLY",
    tier: "core",
    displayName: "Core",
    tagline: "Starter essentials for smaller teams",
    billingPeriod: "yearly",
    pricePerYear: 499,
    currency: "GBP",
    selfServe: true,
    av30Included: 15,
    maxChildrenIncluded: 50,
    maxSitesIncluded: 1,
    features: [
      "Up to 15 active staff and volunteers",
      "Up to 50 children",
      "1 site",
      "Attendance tracking",
      "Rota and timetable management",
      "Safeguarding notes and concerns",
      "Parent communication",
      "Mobile app access",
      "Standard reporting",
      "GDPR-compliant data handling",
    ],
    addons: [
      {
        label: "Storage",
        description: "Additional storage available (100GB, 200GB, or 1TB packs)",
      },
    ],
    doesNotInclude: ["Capacity add-ons (extra staff and site capacity)"],
    upgradeWhen:
      "You need higher staff capacity, more children capacity, or multi-site support.",
    bestFor: "Organisations that need Starter workflows at a smaller operating size.",
  },
  STARTER_MONTHLY: {
    code: "STARTER_MONTHLY",
    tier: "starter",
    displayName: "Starter",
    tagline: "Run your organisation properly",
    billingPeriod: "monthly",
    pricePerMonth: 149,
    currency: "GBP",
    selfServe: true,
    av30Included: 50,
    maxChildrenIncluded: null,
    maxSitesIncluded: 1,
    features: [
      "Up to 50 active staff and volunteers",
      "1 site",
      "Attendance tracking",
      "Rota and timetable management",
      "Safeguarding notes and concerns",
      "Parent communication",
      "Mobile app access",
      "Standard reporting",
      "GDPR-compliant data handling",
    ],
    addons: [
      {
        label: "Storage",
        description: "Additional storage available (100GB, 200GB, or 1TB packs)",
      },
    ],
    notes: [
      "No setup fees",
      "Cancel any time before your next renewal",
      "You keep control of your data; we support exports if you need to move away",
    ],
    bestFor: "Single-site schools, churches, clubs, and charities running real sessions with real responsibility.",
  },
  STARTER_YEARLY: {
    code: "STARTER_YEARLY",
    tier: "starter",
    displayName: "Starter",
    tagline: "Run your organisation properly",
    billingPeriod: "yearly",
    pricePerYear: 1490,
    currency: "GBP",
    selfServe: true,
    av30Included: 50,
    maxChildrenIncluded: null,
    maxSitesIncluded: 1,
    features: [
      "Up to 50 active staff and volunteers",
      "1 site",
      "Attendance tracking",
      "Rota and timetable management",
      "Safeguarding notes and concerns",
      "Parent communication",
      "Mobile app access",
      "Standard reporting",
      "GDPR-compliant data handling",
    ],
    addons: [
      {
        label: "Storage",
        description: "Additional storage available (100GB, 200GB, or 1TB packs)",
      },
    ],
    notes: [
      "No setup fees",
      "Cancel any time before your next renewal",
      "You keep control of your data; we support exports if you need to move away",
    ],
    bestFor: "Single-site schools, churches, clubs, and charities running real sessions with real responsibility.",
  },
  GROWTH_MONTHLY: {
    code: "GROWTH_MONTHLY",
    tier: "growth",
    displayName: "Growth",
    tagline: "Operate at scale",
    billingPeriod: "monthly",
    pricePerMonth: 399,
    currency: "GBP",
    selfServe: true,
    av30Included: 200,
    maxChildrenIncluded: null,
    maxSitesIncluded: 3,
    features: [
      "Up to 200 active staff and volunteers",
      "3 sites",
      "Everything in Starter",
      "Multi-site management",
      "Advanced reporting",
      "Priority support",
      "Custom onboarding",
    ],
    addons: [
      {
        label: "Storage",
        description: "Additional storage available (100GB, 200GB, or 1TB packs)",
      },
      {
        label: "Additional sites",
        description: "Add more sites beyond the included 3",
      },
    ],
    notes: [
      "No setup fees",
      "Cancel any time before your next renewal",
      "You keep control of your data; we support exports if you need to move away",
    ],
    bestFor: "Trusts, academies, and growing organisations that need visibility and control across locations.",
  },
  GROWTH_YEARLY: {
    code: "GROWTH_YEARLY",
    tier: "growth",
    displayName: "Growth",
    tagline: "Operate at scale",
    billingPeriod: "yearly",
    pricePerYear: 3990,
    currency: "GBP",
    selfServe: true,
    av30Included: 200,
    maxChildrenIncluded: null,
    maxSitesIncluded: 3,
    features: [
      "Up to 200 active staff and volunteers",
      "3 sites",
      "Everything in Starter",
      "Multi-site management",
      "Advanced reporting",
      "Priority support",
      "Custom onboarding",
    ],
    addons: [
      {
        label: "Storage",
        description: "Additional storage available (100GB, 200GB, or 1TB packs)",
      },
      {
        label: "Additional sites",
        description: "Add more sites beyond the included 3",
      },
    ],
    notes: [
      "No setup fees",
      "Cancel any time before your next renewal",
      "You keep control of your data; we support exports if you need to move away",
    ],
    bestFor: "Trusts, academies, and growing organisations that need visibility and control across locations.",
  },
  ENTERPRISE_CONTACT: {
    code: "ENTERPRISE_CONTACT",
    tier: "enterprise",
    displayName: "Enterprise",
    tagline: "Built around your organisation",
    billingPeriod: "contact",
    currency: "GBP",
    selfServe: false,
    av30Included: null,
    maxChildrenIncluded: null,
    maxSitesIncluded: null,
    features: [
      "Unlimited active staff and volunteers",
      "Unlimited sites",
      "Everything in Growth",
      "Dedicated account manager",
      "Custom integrations",
      "SLA guarantees",
      "On-site training",
      "Custom retention policies",
    ],
    notes: [
      "Tailored pricing based on your needs",
      "Flexible contract terms",
      "Priority support and dedicated resources",
    ],
    bestFor: "Large trusts, national charities, and organisations with complex compliance needs.",
  },
  // Phase 0 PR 0.2: new target-tier plan codes. Storage is the only add-on for
  // these tiers per the dev doc (§5) — SMS and Active People add-on packs are
  // removed in PR 0.3/0.4 and never offered here.
  STARTER_49_MONTHLY: {
    code: "STARTER_49_MONTHLY",
    tier: "starter",
    displayName: "Starter",
    tagline: "Run your organisation properly",
    billingPeriod: "monthly",
    pricePerMonth: 49,
    currency: "GBP",
    selfServe: true,
    av30Included: 50,
    maxChildrenIncluded: null,
    maxSitesIncluded: 1,
    features: [
      "Up to 50 active staff and volunteers",
      "1 site",
      "Attendance tracking",
      "Rota and timetable management",
      "Safeguarding notes and concerns",
      "Parent communication",
      "Mobile app access",
      "Standard reporting",
      "GDPR-compliant data handling",
    ],
    addons: [
      {
        label: "Storage",
        description: "Additional storage available (100GB, 200GB, or 1TB packs)",
      },
    ],
    notes: [
      "No setup fees",
      "Cancel any time before your next renewal",
      "You keep control of your data; we support exports if you need to move away",
    ],
    bestFor: "Single-site schools, churches, clubs, and charities running real sessions with real responsibility.",
  },
  STARTER_49_YEARLY: {
    code: "STARTER_49_YEARLY",
    tier: "starter",
    displayName: "Starter",
    tagline: "Run your organisation properly",
    billingPeriod: "yearly",
    pricePerYear: 490,
    currency: "GBP",
    selfServe: true,
    av30Included: 50,
    maxChildrenIncluded: null,
    maxSitesIncluded: 1,
    features: [
      "Up to 50 active staff and volunteers",
      "1 site",
      "Attendance tracking",
      "Rota and timetable management",
      "Safeguarding notes and concerns",
      "Parent communication",
      "Mobile app access",
      "Standard reporting",
      "GDPR-compliant data handling",
    ],
    addons: [
      {
        label: "Storage",
        description: "Additional storage available (100GB, 200GB, or 1TB packs)",
      },
    ],
    notes: [
      "No setup fees",
      "Cancel any time before your next renewal",
      "You keep control of your data; we support exports if you need to move away",
    ],
    bestFor: "Single-site schools, churches, clubs, and charities running real sessions with real responsibility.",
  },
  GROWTH_99_MONTHLY: {
    code: "GROWTH_99_MONTHLY",
    tier: "growth",
    displayName: "Growth",
    tagline: "Operate at scale",
    billingPeriod: "monthly",
    pricePerMonth: 99,
    currency: "GBP",
    selfServe: true,
    av30Included: 100,
    maxChildrenIncluded: null,
    maxSitesIncluded: 2,
    features: [
      "Up to 100 active staff and volunteers",
      "2 sites",
      "Everything in Starter",
      "Multi-site management",
      "Advanced reporting",
      "Priority support",
      "Custom onboarding",
    ],
    addons: [
      {
        label: "Storage",
        description: "Additional storage available (100GB, 200GB, or 1TB packs)",
      },
    ],
    notes: [
      "No setup fees",
      "Cancel any time before your next renewal",
      "You keep control of your data; we support exports if you need to move away",
    ],
    bestFor: "Trusts, academies, and growing organisations that need visibility and control across locations.",
  },
  GROWTH_99_YEARLY: {
    code: "GROWTH_99_YEARLY",
    tier: "growth",
    displayName: "Growth",
    tagline: "Operate at scale",
    billingPeriod: "yearly",
    pricePerYear: 990,
    currency: "GBP",
    selfServe: true,
    av30Included: 100,
    maxChildrenIncluded: null,
    maxSitesIncluded: 2,
    features: [
      "Up to 100 active staff and volunteers",
      "2 sites",
      "Everything in Starter",
      "Multi-site management",
      "Advanced reporting",
      "Priority support",
      "Custom onboarding",
    ],
    addons: [
      {
        label: "Storage",
        description: "Additional storage available (100GB, 200GB, or 1TB packs)",
      },
    ],
    notes: [
      "No setup fees",
      "Cancel any time before your next renewal",
      "You keep control of your data; we support exports if you need to move away",
    ],
    bestFor: "Trusts, academies, and growing organisations that need visibility and control across locations.",
  },
  // Professional is genuinely new (no prior-generation equivalent tier); copy below
  // is a minimal placeholder pending a real content pass before customer-facing launch.
  PROFESSIONAL_149_MONTHLY: {
    code: "PROFESSIONAL_149_MONTHLY",
    tier: "professional",
    displayName: "Professional",
    tagline: "For established, multi-site organisations",
    billingPeriod: "monthly",
    pricePerMonth: 149,
    currency: "GBP",
    selfServe: true,
    av30Included: 200,
    maxChildrenIncluded: null,
    maxSitesIncluded: 5,
    features: [
      "Up to 200 active staff and volunteers",
      "Up to 5 sites",
      "Everything in Growth",
      "Advanced reporting",
      "Priority support",
      "Custom onboarding",
    ],
    addons: [
      {
        label: "Storage",
        description: "Additional storage available (100GB, 200GB, or 1TB packs)",
      },
    ],
    notes: [
      "No setup fees",
      "Cancel any time before your next renewal",
      "You keep control of your data; we support exports if you need to move away",
    ],
    bestFor: "Large, established organisations that have outgrown Growth.",
  },
  PROFESSIONAL_149_YEARLY: {
    code: "PROFESSIONAL_149_YEARLY",
    tier: "professional",
    displayName: "Professional",
    tagline: "For established, multi-site organisations",
    billingPeriod: "yearly",
    pricePerYear: 1490,
    currency: "GBP",
    selfServe: true,
    av30Included: 200,
    maxChildrenIncluded: null,
    maxSitesIncluded: 5,
    features: [
      "Up to 200 active staff and volunteers",
      "Up to 5 sites",
      "Everything in Growth",
      "Advanced reporting",
      "Priority support",
      "Custom onboarding",
    ],
    addons: [
      {
        label: "Storage",
        description: "Additional storage available (100GB, 200GB, or 1TB packs)",
      },
    ],
    notes: [
      "No setup fees",
      "Cancel any time before your next renewal",
      "You keep control of your data; we support exports if you need to move away",
    ],
    bestFor: "Large, established organisations that have outgrown Growth.",
  },
} as const;

/**
 * Ordered list of plan codes for marketing display.
 * Monthly plans first, then yearly, then enterprise.
 */
export const orderedPlanCodes: PlanCode[] = [
  "CORE_MONTHLY",
  "STARTER_MONTHLY",
  "GROWTH_MONTHLY",
  "CORE_YEARLY",
  "STARTER_YEARLY",
  "GROWTH_YEARLY",
  "STARTER_49_MONTHLY",
  "GROWTH_99_MONTHLY",
  "PROFESSIONAL_149_MONTHLY",
  "STARTER_49_YEARLY",
  "GROWTH_99_YEARLY",
  "PROFESSIONAL_149_YEARLY",
  "ENTERPRISE_CONTACT",
];

/**
 * Get plans grouped by tier for easier display.
 */
export function getPlansByTier(): Record<PlanTier, PlanDefinition[]> {
  return {
    core: [PLANS.CORE_MONTHLY, PLANS.CORE_YEARLY],
    starter: [PLANS.STARTER_MONTHLY, PLANS.STARTER_YEARLY, PLANS.STARTER_49_MONTHLY, PLANS.STARTER_49_YEARLY],
    growth: [PLANS.GROWTH_MONTHLY, PLANS.GROWTH_YEARLY, PLANS.GROWTH_99_MONTHLY, PLANS.GROWTH_99_YEARLY],
    professional: [PLANS.PROFESSIONAL_149_MONTHLY, PLANS.PROFESSIONAL_149_YEARLY],
    enterprise: [PLANS.ENTERPRISE_CONTACT],
  };
}

/**
 * Get self-serve plans only (excludes Enterprise contact).
 */
export function getSelfServePlans(): PlanDefinition[] {
  return Object.values(PLANS).filter((plan) => plan.selfServe);
}

export const PRICING_FAQS: PricingFaq[] = [
  {
    question: "Are there any hidden fees?",
    answer:
      "No. The price you see is the price you pay. There are no setup fees, no per-user fees beyond your plan's included active staff and volunteers, and no surprise charges. Storage is the only add-on, clearly priced and optional.",
  },
  {
    question: "Can I cancel my subscription?",
    answer:
      "Yes. You can cancel your subscription at any time before your next renewal. You'll continue to have access until the end of your current billing period, and you can export your data at any time.",
  },
  {
    question: "What happens to my data if I cancel?",
    answer:
      "You keep control of your data. You can export all your data at any time through the admin interface. We support Data Subject Access Requests (DSARs) and can provide exports in standard formats. After cancellation, data is retained according to your organisation's retention policy, then securely deleted.",
  },
  {
    question: "How is the active staff and volunteer allowance counted?",
    answer:
      "The allowance counts unique staff and volunteers with qualifying activity in the previous 30 days. Activity includes being scheduled on a rota, responding to assignments, or recording attendance. Parent accounts do not count.",
  },
  {
    question: "Can I change plans later?",
    answer:
      "Yes. You can upgrade or downgrade your plan at any time. When you upgrade, you'll be charged a prorated amount for the remainder of your billing period. When you downgrade, changes take effect at your next renewal.",
  },
  {
    question: "Do you offer discounts for annual billing?",
    answer:
      "Yes. Annual plans are priced at approximately 10 months of monthly billing, giving you 2 months free when you pay annually upfront.",
  },
  {
    question: "What's included in each plan?",
    answer:
      "All plans include secure, GDPR-compliant data handling. Starter includes up to 50 active staff and volunteers at 1 site. Growth includes up to 100 active staff and volunteers at 2 sites. Professional includes up to 200 active staff and volunteers at up to 5 sites. Enterprise is customised to your needs.",
  },
];
