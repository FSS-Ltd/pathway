"use client";

/**
 * Pricing page - driven from shared pricing package (Milestone 4).
 * Plan definitions and pricing data come from @pathway/pricing.
 * Prices are fetched from Stripe via the billing/prices endpoint.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { PLANS, PRICING_FAQS } from "@pathway/pricing";
import { track } from "../../../lib/analytics";
import { getFirstTouchAttribution } from "../../../lib/attribution";
import CtaButton from "../../../components/cta-button";
import {
  fetchPublicBillingPrices,
  type PublicBillingPrices,
} from "../../../lib/buy-now-client";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: "easeOut",
    },
  },
};

type PriceOverride = {
  pricePerMonth?: number;
  pricePerYear?: number;
};

type AddonDescriptions = {
  starterExtraPeople?: string;
  growthExtraPeople?: string;
  storage?: string;
  sms?: string;
};

const formatMoney = (amount?: number | null) => {
  if (typeof amount !== "number") return null;
  return amount.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const buildAddonDescriptions = (prices: PublicBillingPrices["prices"]): AddonDescriptions => {
  const byCode = new Map(prices.map((price) => [price.code, price]));
  const getMajor = (code: string) => {
    const price = byCode.get(code);
    if (!price || typeof price.unitAmount !== "number") return null;
    return Number((price.unitAmount / 100).toFixed(2));
  };

  const starterMonthly = getMajor("AV30_BLOCK_25_MONTHLY");
  const starterYearly = getMajor("AV30_BLOCK_25_YEARLY");
  const growthMonthly = getMajor("AV30_BLOCK_50_MONTHLY");
  const growthYearly = getMajor("AV30_BLOCK_50_YEARLY");

  const storage100 = getMajor("STORAGE_100GB_YEARLY");
  const storage200 = getMajor("STORAGE_200GB_YEARLY");
  const storage1tb = getMajor("STORAGE_1TB_YEARLY");

  const smsMonthly = getMajor("SMS_1000_MONTHLY");
  const smsYearly = getMajor("SMS_1000_YEARLY");

  const starterExtraPeople =
    starterMonthly && starterYearly
      ? `Add +25 Active People blocks for £${formatMoney(starterMonthly)}/month or £${formatMoney(
          starterYearly,
        )}/year`
      : undefined;

  const growthExtraPeople =
    growthMonthly && growthYearly
      ? `Add +50 Active People blocks for £${formatMoney(growthMonthly)}/month or £${formatMoney(
          growthYearly,
        )}/year`
      : undefined;

  const storage =
    storage100 && storage200 && storage1tb
      ? `Additional storage packs: 100GB (£${formatMoney(
          storage100,
        )}/year), 200GB (£${formatMoney(storage200)}/year), 1TB (£${formatMoney(
          storage1tb,
        )}/year)`
      : undefined;

  const sms =
    smsMonthly && smsYearly
      ? `Add SMS messaging bundles (1,000 messages) for £${formatMoney(
          smsMonthly,
        )}/month or £${formatMoney(smsYearly)}/year`
      : undefined;

  return {
    starterExtraPeople,
    growthExtraPeople,
    storage,
    sms,
  };
};

export default function PricingPage() {
  const [priceOverrides, setPriceOverrides] = useState<Record<string, PriceOverride>>({});
  const [addonDescriptions, setAddonDescriptions] = useState<AddonDescriptions>({});

  useEffect(() => {
    // Track pricing page view
    const attribution = getFirstTouchAttribution();
    track({
      type: "pricing_view",
      variant: null,
      utm: attribution?.utm,
    });

    // Fetch prices from Stripe
    const loadPrices = async () => {
      try {
        const res = await fetchPublicBillingPrices();
        if (res?.prices?.length) {
          const overrides: Record<string, PriceOverride> = {};
          
          res.prices.forEach((p) => {
            const amountMajor = typeof p.unitAmount === "number" 
              ? Number((p.unitAmount / 100).toFixed(2)) 
              : 0;
            
            if (!amountMajor) return;
            
            // Map MINIMUM_* codes from Stripe to CORE_* codes
            let code = p.code;
            if (code === "MINIMUM_MONTHLY") code = "CORE_MONTHLY";
            if (code === "MINIMUM_YEARLY") code = "CORE_YEARLY";
            
            const interval = p.interval;
            
            if (interval === "month") {
              overrides[code] = { ...overrides[code], pricePerMonth: amountMajor };
            } else if (interval === "year") {
              overrides[code] = { ...overrides[code], pricePerYear: amountMajor };
            }
          });
          
          setPriceOverrides(overrides);
          setAddonDescriptions(buildAddonDescriptions(res.prices));
        }
      } catch (error) {
        console.error("[pricing] Failed to fetch Stripe prices:", error);
        // Fall back to catalog prices
      }
    };
    
    void loadPrices();
  }, []);

  const coreMonthly = {
    ...PLANS.CORE_MONTHLY,
    pricePerMonth: priceOverrides.CORE_MONTHLY?.pricePerMonth ?? PLANS.CORE_MONTHLY.pricePerMonth,
  };
  const coreYearly = {
    ...PLANS.CORE_YEARLY,
    pricePerYear: priceOverrides.CORE_YEARLY?.pricePerYear ?? PLANS.CORE_YEARLY.pricePerYear,
  };
  const starterMonthly = {
    ...PLANS.STARTER_MONTHLY,
    pricePerMonth: priceOverrides.STARTER_MONTHLY?.pricePerMonth ?? PLANS.STARTER_MONTHLY.pricePerMonth,
  };
  const starterYearly = {
    ...PLANS.STARTER_YEARLY,
    pricePerYear: priceOverrides.STARTER_YEARLY?.pricePerYear ?? PLANS.STARTER_YEARLY.pricePerYear,
  };
  const growthMonthly = {
    ...PLANS.GROWTH_MONTHLY,
    pricePerMonth: priceOverrides.GROWTH_MONTHLY?.pricePerMonth ?? PLANS.GROWTH_MONTHLY.pricePerMonth,
  };
  const growthYearly = {
    ...PLANS.GROWTH_YEARLY,
    pricePerYear: priceOverrides.GROWTH_YEARLY?.pricePerYear ?? PLANS.GROWTH_YEARLY.pricePerYear,
  };
  const enterprisePlan = PLANS.ENTERPRISE_CONTACT;
  const starterAddons = starterMonthly.addons?.map((addon) => {
    if (addon.label === "Extra Active People" && addonDescriptions.starterExtraPeople) {
      return { ...addon, description: addonDescriptions.starterExtraPeople };
    }
    if (addon.label === "Storage" && addonDescriptions.storage) {
      return { ...addon, description: addonDescriptions.storage };
    }
    if (addon.label === "SMS bundles" && addonDescriptions.sms) {
      return { ...addon, description: addonDescriptions.sms };
    }
    return addon;
  });
  const growthAddons = growthMonthly.addons?.map((addon) => {
    if (addon.label === "Extra Active People" && addonDescriptions.growthExtraPeople) {
      return { ...addon, description: addonDescriptions.growthExtraPeople };
    }
    if (addon.label === "Storage" && addonDescriptions.storage) {
      return { ...addon, description: addonDescriptions.storage };
    }
    if (addon.label === "SMS bundles" && addonDescriptions.sms) {
      return { ...addon, description: addonDescriptions.sms };
    }
    return addon;
  });

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-12 px-4 py-16 md:py-24">
        {/* Hero */}
        <motion.div
          className="flex flex-col gap-4 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-4xl font-bold text-pw-text md:text-5xl">
            Pricing for connected operations
          </h1>
          <p className="text-lg text-pw-text-muted md:text-xl">
            Choose the level of structure your organisation needs to run attendance,
            scheduling, family communication, safeguarding, and reporting in one place.
          </p>
        </motion.div>

      {/* Plan Cards */}
      <motion.div
        className="mx-auto grid max-w-7xl gap-6 md:grid-cols-2 lg:grid-cols-4"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Core Card */}
        <motion.div
          className="flex flex-col rounded-xl border border-pw-border bg-white p-6 shadow-sm transition hover:shadow-card"
          variants={itemVariants}
          whileHover={{ y: -5, transition: { duration: 0.2 } }}
        >
          <div className="mb-4">
            <h3 className="text-2xl font-bold text-pw-text">{coreMonthly.displayName}</h3>
            <p className="mt-1 text-sm text-pw-text-muted">{coreMonthly.tagline}</p>
          </div>

          <div className="mb-4">
            <p className="text-sm text-pw-text-muted">Replace paper and spreadsheets. Nothing more.</p>
          </div>

          {/* Pricing - Monthly and Yearly */}
          <div className="mb-6 space-y-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-pw-text">
                £{coreMonthly.pricePerMonth?.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-pw-text-muted">/month</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-pw-text">
                £{coreYearly.pricePerYear?.toLocaleString("en-GB")}
              </span>
              <span className="text-pw-text-muted">/year</span>
              <span className="ml-2 text-sm text-pw-text-muted">
                (save £
                {((coreMonthly.pricePerMonth || 0) * 12 - (coreYearly.pricePerYear || 0)).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                )
              </span>
            </div>
          </div>

          <ul className="mb-6 flex-1 space-y-2 text-sm">
            {coreMonthly.features.map((feature, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="mt-1 text-pw-primary">✓</span>
                <span className="text-pw-text-muted">{feature}</span>
              </li>
            ))}
          </ul>

          {coreMonthly.doesNotInclude && coreMonthly.doesNotInclude.length > 0 && (
            <div className="mb-6">
              <p className="mb-2 text-xs font-semibold text-pw-text-muted">Does not include:</p>
              <ul className="space-y-1 text-xs text-pw-text-muted">
                {coreMonthly.doesNotInclude.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="mt-1 text-pw-text-muted/60">✗</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {coreMonthly.bestFor && (
            <p className="mb-4 text-xs text-pw-text-muted italic">{coreMonthly.bestFor}</p>
          )}

          {coreMonthly.upgradeWhen && (
            <p className="mb-6 text-xs text-pw-text-muted">
              <strong className="text-pw-text">Upgrade when:</strong> {coreMonthly.upgradeWhen}
            </p>
          )}

          <CtaButton
            href="/buy"
            location="pricing_core"
          >
            Start with Core
          </CtaButton>
        </motion.div>

        {/* Starter Card */}
        <motion.div
          className="flex flex-col rounded-xl border border-pw-border bg-white p-6 shadow-sm transition hover:shadow-card"
          variants={itemVariants}
          whileHover={{ y: -5, transition: { duration: 0.2 } }}
        >
          <div className="mb-4">
            <h3 className="text-2xl font-bold text-pw-text">{starterMonthly.displayName}</h3>
            <p className="mt-1 text-sm text-pw-text-muted">{starterMonthly.tagline}</p>
          </div>

          <div className="mb-4">
            <p className="text-sm text-pw-text-muted">Everything you need to manage people, sessions, and safeguarding - in one place.</p>
          </div>

          {/* Pricing - Monthly and Yearly */}
          <div className="mb-6 space-y-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-pw-text">
                £{starterMonthly.pricePerMonth?.toLocaleString("en-GB")}
              </span>
              <span className="text-pw-text-muted">/month</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-pw-text">
                £{starterYearly.pricePerYear?.toLocaleString("en-GB")}
              </span>
              <span className="text-pw-text-muted">/year</span>
              <span className="ml-2 text-sm text-pw-text-muted">
                (save £
                {((starterMonthly.pricePerMonth || 0) * 12 - (starterYearly.pricePerYear || 0)).toLocaleString("en-GB")}
                )
              </span>
            </div>
          </div>

          <div className="mb-6 space-y-2 text-sm text-pw-text-muted">
            {starterMonthly.av30Included && (
              <p>
                <strong className="text-pw-text">Up to {starterMonthly.av30Included} active people</strong>
              </p>
            )}
            {starterMonthly.maxSitesIncluded && (
              <p>
                <strong className="text-pw-text">
                  {starterMonthly.maxSitesIncluded === 1
                    ? "1 site included"
                    : `${starterMonthly.maxSitesIncluded} sites included`}
                </strong>
              </p>
            )}
          </div>

          <ul className="mb-6 flex-1 space-y-2 text-sm">
            {starterMonthly.features.map((feature, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="mt-1 text-pw-primary">✓</span>
                <span className="text-pw-text-muted">{feature}</span>
              </li>
            ))}
          </ul>

          {starterAddons && starterAddons.length > 0 && (
            <div className="mb-6">
              <p className="mb-2 text-xs font-semibold text-pw-text">Add-ons available:</p>
              <ul className="space-y-1 text-xs text-pw-text-muted">
                {starterAddons.map((addon, idx) => (
                  <li key={idx}>• {addon.label}</li>
                ))}
              </ul>
            </div>
          )}

          {starterMonthly.bestFor && (
            <p className="mb-6 text-xs text-pw-text-muted italic">{starterMonthly.bestFor}</p>
          )}

          <CtaButton
            href="/buy"
            location="pricing_starter"
          >
            Start with Starter
          </CtaButton>
        </motion.div>

        {/* Growth Card */}
        <motion.div
          className="flex flex-col rounded-xl border border-pw-border bg-white p-6 shadow-sm transition hover:shadow-card"
          variants={itemVariants}
          whileHover={{ y: -5, transition: { duration: 0.2 } }}
        >
          <div className="mb-4">
            <h3 className="text-2xl font-bold text-pw-text">{growthMonthly.displayName}</h3>
            <p className="mt-1 text-sm text-pw-text-muted">{growthMonthly.tagline}</p>
          </div>

          <div className="mb-4">
            <p className="text-sm text-pw-text-muted">Designed for organisations managing multiple sites or larger teams.</p>
          </div>

          {/* Pricing - Monthly and Yearly */}
          <div className="mb-6 space-y-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-pw-text">
                £{growthMonthly.pricePerMonth?.toLocaleString("en-GB")}
              </span>
              <span className="text-pw-text-muted">/month</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-pw-text">
                £{growthYearly.pricePerYear?.toLocaleString("en-GB")}
              </span>
              <span className="text-pw-text-muted">/year</span>
              <span className="ml-2 text-sm text-pw-text-muted">
                (save £
                {((growthMonthly.pricePerMonth || 0) * 12 - (growthYearly.pricePerYear || 0)).toLocaleString("en-GB")}
                )
              </span>
            </div>
          </div>

          <div className="mb-6 space-y-2 text-sm text-pw-text-muted">
            {growthMonthly.av30Included && (
              <p>
                <strong className="text-pw-text">Up to {growthMonthly.av30Included} active people</strong>
              </p>
            )}
            {growthMonthly.maxSitesIncluded && (
              <p>
                <strong className="text-pw-text">
                  {growthMonthly.maxSitesIncluded === 1
                    ? "1 site included"
                    : `${growthMonthly.maxSitesIncluded} sites included`}
                </strong>
              </p>
            )}
          </div>

          <ul className="mb-6 flex-1 space-y-2 text-sm">
            {growthMonthly.features.map((feature, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="mt-1 text-pw-primary">✓</span>
                <span className="text-pw-text-muted">{feature}</span>
              </li>
            ))}
          </ul>

          {growthAddons && growthAddons.length > 0 && (
            <div className="mb-6">
              <p className="mb-2 text-xs font-semibold text-pw-text">Add-ons available:</p>
              <ul className="space-y-1 text-xs text-pw-text-muted">
                {growthAddons.map((addon, idx) => (
                  <li key={idx}>• {addon.label}</li>
                ))}
              </ul>
            </div>
          )}

          {growthMonthly.bestFor && (
            <p className="mb-6 text-xs text-pw-text-muted italic">{growthMonthly.bestFor}</p>
          )}

          <CtaButton
            href="/buy"
            location="pricing_growth"
          >
            Start with Growth
          </CtaButton>
        </motion.div>

        {/* Enterprise Card */}
        <motion.div
          className="flex flex-col rounded-xl border-2 border-pw-primary bg-white p-6 shadow-sm transition hover:shadow-card"
          variants={itemVariants}
          whileHover={{ y: -5, transition: { duration: 0.2 } }}
        >
          <div className="mb-4">
            <h3 className="text-2xl font-bold text-pw-text">{enterprisePlan.displayName}</h3>
            <p className="mt-1 text-sm text-pw-text-muted">{enterprisePlan.tagline}</p>
          </div>

          <div className="mb-4">
            <p className="text-sm text-pw-text-muted">For complex environments with bespoke requirements.</p>
          </div>

          <div className="mb-6 flex items-baseline gap-2">
            <span className="text-3xl font-bold text-pw-text">Custom pricing</span>
          </div>

          <div className="mb-6 space-y-2 text-sm text-pw-text-muted">
            <p>
              <strong className="text-pw-text">Unlimited staff / volunteers</strong>
            </p>
            <p>
              <strong className="text-pw-text">Unlimited sites</strong>
            </p>
          </div>

          <ul className="mb-6 flex-1 space-y-2 text-sm">
            {enterprisePlan.features.map((feature, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="mt-1 text-pw-primary">✓</span>
                <span className="text-pw-text-muted">{feature}</span>
              </li>
            ))}
          </ul>

          {enterprisePlan.bestFor && (
            <p className="mb-6 text-xs text-pw-text-muted italic">{enterprisePlan.bestFor}</p>
          )}

          <CtaButton
            href="/demo?plan=enterprise"
            location="pricing_enterprise"
          >
            Contact sales
          </CtaButton>
        </motion.div>
      </motion.div>

      {/* What's Included vs Add-ons */}
      <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-2">
        <section className="rounded-xl border border-pw-border bg-white p-6">
          <h2 className="mb-4 text-2xl font-semibold text-pw-text">What's included</h2>
          <ul className="space-y-3 text-sm text-pw-text-muted">
            <li className="flex items-start gap-2">
              <span className="mt-1 text-pw-primary">✓</span>
              <span>Attendance tracking and offline capture</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 text-pw-primary">✓</span>
              <span>Rota and timetable management</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 text-pw-primary">✓</span>
              <span>Safeguarding notes and concerns workflow</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 text-pw-primary">✓</span>
              <span>Parent communication and announcements</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 text-pw-primary">✓</span>
              <span>Mobile app for staff and parents</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 text-pw-primary">✓</span>
              <span>GDPR-compliant data handling and exports</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1 text-pw-primary">✓</span>
              <span>Multi-tenant security with Row-Level Security</span>
            </li>
          </ul>
        </section>

        <section className="rounded-xl border border-pw-border bg-white p-6">
          <h2 className="mb-4 text-2xl font-semibold text-pw-text">Add-ons</h2>
          <p className="mb-4 text-sm text-pw-text-muted">
            Extend your plan with optional add-ons to meet your organisation's needs.
          </p>
          <ul className="space-y-3 text-sm text-pw-text-muted">
            {starterAddons?.map((addon, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="mt-1 text-pw-primary">+</span>
                <div>
                  <strong className="text-pw-text">{addon.label}</strong>
                  <p className="text-xs">{addon.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Plain-language promises */}
      <section className="mx-auto max-w-5xl rounded-xl border border-pw-border bg-white p-6">
        <h2 className="mb-4 text-2xl font-semibold text-pw-text">Our commitment to you</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <h3 className="mb-2 font-semibold text-pw-text">No hidden fees</h3>
            <p className="text-sm text-pw-text-muted">
              The price you see is the price you pay. No setup fees, no per-user charges beyond
              your plan's included Active People, and no surprise charges.
            </p>
          </div>
          <div>
            <h3 className="mb-2 font-semibold text-pw-text">Cancel any time</h3>
            <p className="text-sm text-pw-text-muted">
              Cancel your subscription at any time before your next renewal. You'll continue to
              have access until the end of your current billing period.
            </p>
          </div>
          <div>
            <h3 className="mb-2 font-semibold text-pw-text">You own your data</h3>
            <p className="text-sm text-pw-text-muted">
              You keep control of your data. We support exports if you need to move away, and we
              never lock you in.
            </p>
          </div>
        </div>
      </section>

      {/* FAQs */}
      <section className="rounded-xl border border-pw-border bg-white p-6">
        <h2 className="mb-6 text-2xl font-semibold text-pw-text">Frequently asked questions</h2>
        <div className="space-y-6">
          {PRICING_FAQS.map((faq, idx) => (
            <div key={idx}>
              <h3 className="mb-2 font-semibold text-pw-text">{faq.question}</h3>
              <p className="text-sm text-pw-text-muted">{faq.answer}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
