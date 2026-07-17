"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import clsx from "clsx";
import {
  PLAN_PRICES,
  ADDON_PRICES,
  type PlanCode,
  type AddonCode,
  type BuyNowSelection,
  type StripePriceMeta,
  calculateCartTotals,
  mergeBillingPrices,
} from "../../lib/buy-now-pricing";
import {
  createCheckoutSession,
  previewPlanSelection,
  type PlanPreviewResponse,
  fetchPublicBillingPrices,
  SECTOR_OPTIONS,
  type Sector,
} from "../../lib/buy-now-client";

type PlanTier = "core" | "starter" | "growth" | "enterprise";
type BillingFrequency = "monthly" | "yearly";

const tierToPlanCode = (
  tier: PlanTier,
  frequency: BillingFrequency,
): PlanCode | null => {
  if (tier === "core") return frequency === "monthly" ? "CORE_MONTHLY" : "CORE_YEARLY";
  if (tier === "starter") return frequency === "monthly" ? "STARTER_MONTHLY" : "STARTER_YEARLY";
  if (tier === "growth") return frequency === "monthly" ? "GROWTH_MONTHLY" : "GROWTH_YEARLY";
  return null;
};

const formatAmount = (amount: number) => {
  const hasFraction = Math.abs(amount % 1) > 0.000001;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  }).format(amount);
};

export default function BuyNowPage() {
  const [planTier, setPlanTier] = useState<PlanTier>("starter");
  const [frequency, setFrequency] = useState<BillingFrequency>("monthly");

  const [storageChoice, setStorageChoice] = useState<"none" | "100" | "200" | "1000">("none");
  const [planPriceOverrides, setPlanPriceOverrides] = useState<Partial<Record<PlanCode, typeof PLAN_PRICES[PlanCode]>>>({});
  const [addonPriceOverrides, setAddonPriceOverrides] = useState<
    Partial<
      Record<
        | "STORAGE_100GB_YEARLY"
        | "STORAGE_200GB_YEARLY"
        | "STORAGE_1TB_YEARLY",
        { amountMajor: number; label: string }
      >
    >
  >({});

  const [orgName, setOrgName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sector, setSector] = useState<Sector | "">("");

  const [preview, setPreview] = useState<PlanPreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);

  const planCode = useMemo(
    () => tierToPlanCode(planTier, frequency),
    [planTier, frequency],
  );

  useEffect(() => {
    const loadPrices = async () => {
      try {
        const res = await fetchPublicBillingPrices();
        if (res?.prices?.length) {
          const { planPrices, addonPrices } = mergeBillingPrices(
            res.prices.map((p) => ({
              code: p.code,
              unitAmount: p.unitAmount,
              interval: p.interval,
            })),
          );
          setPlanPriceOverrides(planPrices);
          setAddonPriceOverrides(addonPrices);
        }
      } catch (error) {
        console.error("[buy-now] public pricing fetch failed", error);
        // fallback to static prices on error
      }
    };
    void loadPrices();
  }, []);

  const selection: BuyNowSelection | null = planCode
    ?       {
        planCode,
        frequency,
        storageAddon100Gb: storageChoice === "100" ? 1 : 0,
        storageAddon200Gb: storageChoice === "200" ? 1 : 0,
        storageAddon1Tb: storageChoice === "1000" ? 1 : 0,
      }
    : null;

  const mergedPlanPrices: Record<PlanCode, StripePriceMeta> = {
    ...PLAN_PRICES,
    ...planPriceOverrides,
  };
  const mergedAddonPrices: Partial<Record<AddonCode, { stripePriceId?: string; amountMajor: number; label: string }>> = {
    ...(ADDON_PRICES as Record<AddonCode, { stripePriceId?: string; amountMajor: number; label: string }>),
    ...addonPriceOverrides,
  };
  const totals = selection
    ? calculateCartTotals(selection, {
        planPrices: mergedPlanPrices,
        addonPrices: mergedAddonPrices,
      })
    : null;

  useEffect(() => {
    if (!planCode) {
      setPreview(null);
      setPreviewError("Please choose a plan to see entitlements.");
      return;
    }
    setPreviewError(null);
    const controller = new AbortController();
    setIsPreviewLoading(true);
    const handle = setTimeout(async () => {
      try {
        const extraStorageGb =
          storageChoice === "100"
            ? 100
            : storageChoice === "200"
              ? 200
              : storageChoice === "1000"
                ? 1000
                : 0;

        const result = await previewPlanSelection(
          {
            planCode,
            addons: {
              extraStorageGb,
            },
          },
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) {
          setPreview(result);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setPreview(null);
        setPreviewError(
          err instanceof Error ? err.message : "We couldn’t load the plan preview.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsPreviewLoading(false);
        }
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(handle);
    };
  }, [
    planCode,
    frequency,
    storageChoice,
  ]);

  const handleCheckout = async () => {
    setCheckoutError(null);
    if (!planCode || planTier === "enterprise") {
      setCheckoutError("Please choose Starter or Growth to continue.");
      return;
    }
    if (!orgName || !contactName || !contactEmail || !password || !sector) {
      setCheckoutError("Please complete all organisation and contact details, including sector and password.");
      return;
    }
    if (password.length < 8) {
      setCheckoutError("Password must be at least 8 characters long.");
      return;
    }
    setIsCheckoutLoading(true);
    try {
      const buildRedirectUrl = (path: string) => {
        if (typeof window === "undefined" || !window.location) return null;
        const url = new URL(path, window.location.href);
        return url.toString();
      };

      const successUrl = buildRedirectUrl("/buy/thanks");
      const cancelUrl = buildRedirectUrl("/buy/cancelled");
      if (!successUrl || !cancelUrl) {
        setCheckoutError("Unable to determine redirect URLs; please try again in the browser.");
        setIsCheckoutLoading(false);
        return;
      }
      const { sessionUrl } = await createCheckoutSession({
        planCode,
        billingPeriod: frequency,
        storageAddon100Gb: storageChoice === "100" ? 1 : 0,
        storageAddon200Gb: storageChoice === "200" ? 1 : 0,
        storageAddon1Tb: storageChoice === "1000" ? 1 : 0,
        orgName,
        contactName,
        contactEmail,
        password,
        sector: sector as Sector,
        successUrl,
        cancelUrl,
      });
      window.location.href = sessionUrl;
    } catch (err) {
      setCheckoutError(
        err instanceof Error
          ? err.message
          : "We couldn’t start checkout. Please try again.",
      );
    } finally {
      setIsCheckoutLoading(false);
    }
  };

  const storageKey = frequency === "yearly" ? "YEARLY" : "MONTHLY";
  const storageUnit = frequency === "yearly" ? "year" : "month";
  const storage100 = mergedAddonPrices[`STORAGE_100GB_${storageKey}` as keyof typeof mergedAddonPrices];
  const storage200 = mergedAddonPrices[`STORAGE_200GB_${storageKey}` as keyof typeof mergedAddonPrices];
  const storage1tb = mergedAddonPrices[`STORAGE_1TB_${storageKey}` as keyof typeof mergedAddonPrices];
  const storageOptions = [
    { value: "none", label: "No additional storage" },
    {
      value: "100",
      label:
        storage100 !== undefined
          ? `+100GB - ${formatAmount(storage100?.amountMajor ?? 25)} / ${storageUnit}`
          : `+100GB / ${storageUnit}`,
    },
    {
      value: "200",
      label:
        storage200 !== undefined
          ? `+200GB - ${formatAmount(storage200?.amountMajor ?? 45)} / ${storageUnit}`
          : `+200GB / ${storageUnit}`,
    },
    {
      value: "1000",
      label:
        storage1tb !== undefined
          ? `+1TB - ${formatAmount(storage1tb?.amountMajor ?? 59.99)} / ${storageUnit}`
          : `+1TB / ${storageUnit}`,
    },
  ];

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 md:py-16">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image 
              src="/NSLogo.svg" 
              alt="" 
              width={32} 
              height={32}
              className="h-8 w-8"
            />
            <p className="text-sm font-bold uppercase tracking-wide text-pw-primary">NEXSTEPS</p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-md border border-pw-border px-3 py-2 text-sm font-medium text-pw-text transition hover:border-pw-primary hover:bg-pw-primary-soft hover:text-pw-primary focus-visible:outline focus-visible:outline-2 focus-visible:ring-offset-2 focus-visible:ring-pw-primary"
          >
            ← Back to home
          </Link>
        </div>
        <h1 className="text-3xl font-semibold text-pw-text">Choose your Nexsteps plan</h1>
        <p className="max-w-3xl text-base text-pw-text-muted">
          Select a plan, choose any add-ons, and complete your purchase on our secure
          Stripe checkout. Snapshot webhooks keep subscriptions and entitlements in sync.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <section className="flex flex-col gap-4">
          <div className="rounded-xl border border-pw-border bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Plan</h2>
            <p className="text-sm text-pw-text-muted">
              Core, Starter, and Growth are self-serve. Enterprise is contact-only.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              {[
                {
                  tier: "core" as PlanTier,
                  title: "Core",
                  desc: "Starter essentials for smaller teams.",
                  included: "15 Active People, 50 children, 1 site",
                },
                {
                  tier: "starter" as PlanTier,
                  title: "Starter",
                  desc: "Run your organisation properly.",
                  included: "Includes 50 Active People and 1 site",
                },
                {
                  tier: "growth" as PlanTier,
                  title: "Growth",
                  desc: "Operate at scale.",
                  included: "Includes 200 Active People and 3 sites",
                },
                {
                  tier: "enterprise" as PlanTier,
                  title: "Enterprise",
                  desc: "Built around your organisation.",
                  included: "Contact our team for a tailored quote.",
                },
              ].map((plan) => {
                const isActive = planTier === plan.tier;
                const cardPlanCode = tierToPlanCode(plan.tier, frequency);
                const cardPriceLabel = cardPlanCode
                  ? mergedPlanPrices[cardPlanCode]?.label
                  : null;
                return (
                  <button
                    key={plan.tier}
                    type="button"
                    onClick={() => setPlanTier(plan.tier)}
                    className={clsx(
                      "flex flex-col rounded-lg border p-4 text-left transition",
                      isActive
                        ? "border-pw-primary bg-pw-primary-soft"
                        : "border-pw-border hover:border-pw-primary/60",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-base font-semibold">{plan.title}</p>
                        <p className="text-sm text-pw-text-muted">{plan.desc}</p>
                      </div>
                      {plan.tier === "enterprise" ? (
                        <span className="rounded-full bg-pw-border px-2 py-1 text-xs text-pw-text-muted">
                          Contact
                        </span>
                      ) : cardPriceLabel ? (
                        <span className="text-sm font-medium">{cardPriceLabel}</span>
                      ) : (
                        <span className="text-sm text-pw-text-muted">
                          Price shown in summary
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-pw-text-muted">{plan.included}</p>
                    {plan.tier === "enterprise" && (
                      <Link
                        href="mailto:hello@pathway.app?subject=Nexsteps%20Enterprise%20plan"
                        className="mt-3 inline-flex w-fit rounded-md border border-pw-primary px-3 py-1 text-sm text-pw-primary transition hover:bg-pw-primary-soft"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Contact sales
                      </Link>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <p className="text-sm font-medium text-pw-text">Billing frequency:</p>
              <div className="relative flex h-11 items-center rounded-full border border-pw-primary bg-pw-surface px-1">
                <span
                  className="absolute inset-y-1 left-1 w-[50%] rounded-full bg-pw-primary text-white shadow-sm transition-transform duration-150 ease-out"
                  style={{
                    transform: frequency === "monthly" ? "translateX(0%)" : "translateX(100%)",
                  }}
                />
                {(["monthly", "yearly"] as BillingFrequency[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setFrequency(option)}
                    className={clsx(
                      "relative z-10 w-24 rounded-full px-3 py-2 text-sm font-semibold transition",
                      frequency === option
                        ? "text-white"
                        : "text-pw-text-muted hover:text-pw-text",
                    )}
                  >
                    {option === "monthly" ? "Monthly" : "Yearly"}
                  </button>
                ))}
              </div>
              <p className="text-xs text-pw-text-muted">
                Yearly is billed upfront. Final price confirmed on the Stripe checkout page.
              </p>
            </div>
          </div>

          {planTier !== "enterprise" && (
            <div className="rounded-xl border border-pw-border bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold">Add-ons</h2>
              <p className="text-sm text-pw-text-muted">
                {planTier === "core"
                  ? "Core supports storage add-ons. Capacity expansion is unavailable on Core."
                  : "Adjust capacity now or leave at zero-you can add more later."}
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium">
                    Storage (billed {frequency})
                  </label>
                  <select
                    value={storageChoice}
                    onChange={(e) => setStorageChoice(e.target.value as typeof storageChoice)}
                    className="rounded-md border border-pw-border bg-white px-3 py-2 text-sm text-pw-text focus:border-pw-primary focus:outline-none"
                  >
                    {storageOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-pw-text-muted">
                    Storage add-ons are charged as {frequency} line items at checkout.
                  </span>
                </div>
              </div>
              {frequency === "monthly" && (
                <p className="mt-3 text-xs text-pw-text-muted">
                  Storage packs are yearly only. Switch to yearly billing to include them.
                </p>
              )}
            </div>
          )}

          <div className="rounded-xl border border-pw-border bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold">Organisation & contact</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field
                label="Organisation name"
                required
                value={orgName}
                onChange={setOrgName}
              />
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">
                  Sector <span className="text-pw-primary">*</span>
                </span>
                <select
                  required
                  value={sector}
                  onChange={(e) => setSector(e.target.value as Sector)}
                  className="rounded-md border border-pw-border px-3 py-2 text-sm text-pw-text focus:border-pw-primary focus:outline-none"
                >
                  <option value="" disabled>
                    Select a sector
                  </option>
                  {SECTOR_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                label="Your name"
                required
                value={contactName}
                onChange={setContactName}
              />
              <Field
                label="Work email"
                type="email"
                required
                value={contactEmail}
                onChange={setContactEmail}
              />
              <Field
                label="Password"
                type="password"
                required
                value={password}
                onChange={setPassword}
                helper="Minimum 8 characters. You'll use this to log into Nexsteps."
              />
            </div>
          </div>
        </section>

        <aside className="flex flex-col gap-4">
          <div className="rounded-xl border border-pw-border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Pricing summary</h2>
              <span className="text-xs text-pw-text-muted">Stripe prices</span>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {totals?.lines?.length ? (
                totals.lines.map((line) => (
                  <div key={line.label} className="flex items-center justify-between">
                    <span className="text-sm text-pw-text">{line.label}</span>
                    <span className="text-sm font-medium">
                      {formatAmount(line.amountMajor)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-pw-text-muted">
                  Select a plan to see totals.
                </p>
              )}
            </div>
            <div className="my-3 h-px bg-pw-border" />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">
                  Total per {frequency === "monthly" ? "month" : "year"}
                </p>
                <p className="text-xs text-pw-text-muted">
                  Final price and tax confirmed on Stripe checkout.
                </p>
              </div>
              <p className="text-xl font-semibold">
                {formatAmount(totals?.totalMajor ?? 0)}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCheckout}
              disabled={
                isCheckoutLoading ||
                planTier === "enterprise" ||
                !planCode ||
                !selection
              }
              className={clsx(
                "mt-4 w-full rounded-md px-4 py-3 text-center text-sm font-semibold shadow-sm transition",
                planTier === "enterprise" || !planCode
                  ? "cursor-not-allowed bg-pw-border text-pw-text-muted"
                  : "bg-pw-primary text-white hover:bg-blue-600",
              )}
            >
              {isCheckoutLoading ? "Redirecting…" : "Continue to secure checkout"}
            </button>
            {checkoutError && (
              <p className="mt-2 text-sm text-pw-danger">{checkoutError}</p>
            )}
            <p className="mt-2 text-xs text-pw-text-muted">
              We rely on Stripe-hosted Checkout. Subscriptions and entitlements are kept
              in sync via the Stripe snapshot webhook.
            </p>
          </div>

          <div className="rounded-xl border border-pw-border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Entitlement preview</h3>
              {isPreviewLoading && (
                <span className="text-xs text-pw-text-muted">Loading…</span>
              )}
            </div>
            {preview && (
              <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <PreviewRow label="Plan" value={preview.displayName ?? "-"} />
                <PreviewRow
                  label="Billing"
                  value={
                    preview.billingPeriod === "monthly"
                      ? "Monthly"
                      : preview.billingPeriod === "yearly"
                        ? "Yearly"
                        : "-"
                  }
                />
                <PreviewRow
                  label="Active People cap"
                  value={preview.effectiveCaps.av30Cap ?? "-"}
                />
                <PreviewRow
                  label="Children cap"
                  value={preview.effectiveCaps.maxChildren ?? "-"}
                />
                <PreviewRow
                  label="Sites cap"
                  value={preview.effectiveCaps.maxSites ?? "-"}
                />
                <PreviewRow
                  label="Storage (GB)"
                  value={preview.effectiveCaps.storageGbCap ?? "-"}
                />
                <PreviewRow
                  label="SMS messages"
                  value={preview.effectiveCaps.smsMessagesCap ?? "-"}
                />
              </dl>
            )}
            {previewError && (
              <p className="mt-2 text-sm text-pw-danger">{previewError}</p>
            )}
            <p className="mt-2 text-xs text-pw-text-muted">
              Preview comes from the backend plan catalogue; final entitlements are set
              when Stripe snapshot webhooks confirm the checkout.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  type = "text",
  helper,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: "text" | "email" | "password";
  helper?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium">
        {label} {required && <span className="text-pw-primary">*</span>}
      </span>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-pw-border px-3 py-2 text-sm text-pw-text focus:border-pw-primary focus:outline-none"
      />
      {helper && <span className="text-xs text-pw-text-muted">{helper}</span>}
    </label>
  );
}

function PreviewRow({ label, value }: { label: string; value: string | number }) {
  return (
    <>
      <dt className="text-xs text-pw-text-muted">{label}</dt>
      <dd className="text-sm font-medium">{value ?? "-"}</dd>
    </>
  );
}
