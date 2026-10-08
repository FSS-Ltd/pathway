"use client";

import React from "react";
import Link from "next/link";
import { useSession } from "@/lib/use-session-compat";
import { useAdminContext } from "@/lib/admin-context";
import {
  Badge,
  Button,
  Card,
  Input,
  Label,
  Textarea,
} from "@pathway/ui";
import {
  AdminPlanPreview,
  createBuyNowPurchase,
  previewPlanSelection,
  fetchBillingPrices,
  fetchBillingOverview,
  fetchPeopleForOrg,
} from "../../../lib/api-client";
import {
  PLAN_PRICES,
  ADDON_PRICES,
  calculateCartTotals,
  mergeBillingPrices,
  type PlanCode,
} from "../../../lib/buy-now-pricing";

const planOptions = [
  {
    code: "STARTER",
    label: "Starter",
    description: "For single-site organisations getting started.",
    baseAv30: 50,
    baseSites: 1,
    tier: "starter",
  },
  {
    code: "GROWTH",
    label: "Growth",
    description: "For growing orgs with multiple groups/sites.",
    baseAv30: 100,
    baseSites: 2,
    tier: "growth",
  },
  {
    code: "PROFESSIONAL",
    label: "Professional",
    description: "For established, multi-site organisations.",
    baseAv30: 200,
    baseSites: 5,
    tier: "professional",
  },
  {
    code: "ENTERPRISE_CONTACT",
    label: "Enterprise (contact us)",
    description: "Custom plan and onboarding - we’ll be in touch.",
    baseAv30: null,
    baseSites: null,
    tier: "enterprise",
  },
] as const;

const warningCopy: Record<string, string> = {
  mock_mode: "Running against mock data; for development only.",
  unknown_plan_code: "Plan code not recognised; caps may be incomplete.",
  price_not_included: "Final price and tax confirmed in Stripe checkout.",
  storage_skipped_monthly_plan:
    "Storage add-ons are only available on yearly plans; not included in this checkout.",
};

const formatAmount = (value: number) => {
  const hasFraction = Math.abs(value % 1) > 0.000001;
  return value.toLocaleString("en-GB", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  });
};

export default function BuyNowPage() {
  const { state: adminState } = useAdminContext();
  const snapshot = adminState.status === "ready" ? adminState.snapshot : null;
  const { data: session, status: sessionStatus } = useSession();
  const [planTier, setPlanTier] = React.useState<(typeof planOptions)[number]["code"]>("STARTER");
  const [billingPeriod, setBillingPeriod] = React.useState<"monthly" | "yearly">("monthly");
  const [storageChoice, setStorageChoice] = React.useState<"none" | "100" | "200" | "1000">("none");
  const [learningModule, setLearningModule] = React.useState(false);
  const [planPriceOverrides, setPlanPriceOverrides] = React.useState<
    Partial<Record<PlanCode, (typeof PLAN_PRICES)[Exclude<PlanCode, "ENTERPRISE_CONTACT">]>>
  >({});
  const [addonPriceOverrides, setAddonPriceOverrides] = React.useState<
    Partial<Record<keyof typeof ADDON_PRICES, { amountMajor: number; label: string }>>
  >({});

  const [orgName, setOrgName] = React.useState("");
  const [contactName, setContactName] = React.useState("");
  const [contactEmail, setContactEmail] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [isLoadingOrgInfo, setIsLoadingOrgInfo] = React.useState(true);

  const [preview, setPreview] = React.useState<AdminPlanPreview | null>(null);
  const [previewWarnings, setPreviewWarnings] = React.useState<string[]>([]);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = React.useState(false);

  const [checkoutError, setCheckoutError] = React.useState<string | null>(null);
  const [isCheckoutLoading, setIsCheckoutLoading] = React.useState(false);
  const [currentPlanCode, setCurrentPlanCode] = React.useState<string | null>(null);

  const planCode: PlanCode | null = React.useMemo(() => {
    if (planTier === "ENTERPRISE_CONTACT") return "ENTERPRISE_CONTACT";
    if (planTier === "STARTER") return billingPeriod === "monthly" ? "STARTER_49_MONTHLY" : "STARTER_49_YEARLY";
    if (planTier === "GROWTH") return billingPeriod === "monthly" ? "GROWTH_99_MONTHLY" : "GROWTH_99_YEARLY";
    if (planTier === "PROFESSIONAL") return billingPeriod === "monthly" ? "PROFESSIONAL_149_MONTHLY" : "PROFESSIONAL_149_YEARLY";
    return null;
  }, [planTier, billingPeriod]);

  React.useEffect(() => {
    // Only load data when session is authenticated
    if (sessionStatus !== "authenticated" || !session) return;
    
    const loadPrices = async () => {
      try {
        const res = await fetchBillingPrices();
        if (res?.prices?.length) {
          const { planPrices, addonPrices} = mergeBillingPrices(
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
        console.error("[buy-now] admin pricing fetch failed", error);
        // fall back to static prices on error
      }
    };
    void loadPrices();
  }, [sessionStatus, session]);

  // Load org and owner info to pre-populate contact fields
  React.useEffect(() => {
    if (sessionStatus !== "authenticated" || !session || !snapshot) return;

    const loadOrgInfo = async () => {
      setIsLoadingOrgInfo(true);
      setOrgName(snapshot.org.name);
      try {
        const people = await fetchPeopleForOrg(snapshot.activeOrgId);

        // Find org admin/owner (prioritize ORG_ADMIN role)
        const orgAdmin = people.find(
          (p) => p.orgRole === "ORG_ADMIN" || p.orgRole === "ADMIN",
        ) || people[0]; // Fallback to first person if no admin found

        if (orgAdmin) {
          if (orgAdmin.name) {
            setContactName(orgAdmin.name);
          }
          if (orgAdmin.email) {
            setContactEmail(orgAdmin.email);
          }
        }
      } catch (error) {
        console.error("[buy-now] Failed to load org info:", error);
        // Don't block the form if org info fails to load
      } finally {
        setIsLoadingOrgInfo(false);
      }
    };

    void loadOrgInfo();
  }, [sessionStatus, session, snapshot?.activeOrgId, snapshot?.org.name]);

  // Fetch current plan for "Your current plan" badge and same-plan check
  React.useEffect(() => {
    if (sessionStatus !== "authenticated" || !session) return;
    let cancelled = false;
    fetchBillingOverview()
      .then((overview) => {
        if (!cancelled && overview.planCode) setCurrentPlanCode(overview.planCode);
      })
      .catch(() => {
        if (!cancelled) setCurrentPlanCode(null);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionStatus, session]);

  const loadPreview = React.useCallback(async () => {
    setIsPreviewLoading(true);
    setPreviewError(null);
    try {
      if (!planCode) {
        setPreview(null);
        setPreviewWarnings([]);
        return;
      }
      const extraStorageGb =
        storageChoice === "100"
          ? 100
          : storageChoice === "200"
            ? 200
            : storageChoice === "1000"
              ? 1000
              : 0;
      const result = await previewPlanSelection({
        planCode,
        extraSites: 0,
        extraStorageGb,
        extraLeaderSeats: 0,
      });
      setPreview(result);
      setPreviewWarnings(result.warnings ?? []);
    } catch (err) {
      setPreview(null);
      setPreviewWarnings([]);
      setPreviewError(
        err instanceof Error
          ? err.message
          : "We couldn’t load a plan preview just now.",
      );
    } finally {
      setIsPreviewLoading(false);
    }
  }, [
    planCode,
    storageChoice,
    billingPeriod,
  ]);

  // Debounce preview calls
  React.useEffect(() => {
    // Only load data when session is authenticated
    if (sessionStatus !== "authenticated" || !session) return;

    const handle = setTimeout(() => {
      void loadPreview();
    }, 300);
    return () => clearTimeout(handle);
  }, [
    sessionStatus,
    session,
    loadPreview,
    planCode,
    storageChoice,
    billingPeriod,
  ]);

  const isCurrentPlan = Boolean(planCode && currentPlanCode && planCode === currentPlanCode);
  const hasAddons = storageChoice !== "none" || learningModule;

  const handleCheckout = async () => {
    setCheckoutError(null);
    if (!planCode || planTier === "ENTERPRISE_CONTACT") {
      setCheckoutError("Enterprise is contact-only. Please reach out to sales.");
      return;
    }
    if (isCurrentPlan && !hasAddons) {
      setCheckoutError("Add add-ons above to checkout, or choose a different plan.");
      return;
    }
    setIsCheckoutLoading(true);
    try {
      const buildRedirectUrl = (path: string) => {
        if (typeof window === "undefined" || !window.location) return null;
        const url = new URL(path, window.location.href);
        if (url.hostname === "localhost") {
          url.hostname = "127.0.0.1";
        }
        return url.toString();
      };

      const successUrl = buildRedirectUrl("/billing/buy-now?status=success");
      const cancelUrl = buildRedirectUrl("/billing/buy-now?status=cancel");
      if (!successUrl || !cancelUrl) {
        setCheckoutError("Unable to determine redirect URLs in this environment.");
        setIsCheckoutLoading(false);
        return;
      }
      const extraStorageGb =
        storageChoice === "100"
          ? 100
          : storageChoice === "200"
            ? 200
            : storageChoice === "1000"
              ? 1000
              : 0;
      // Authenticated upgrade: use purchase endpoint (no org/password required)
      const response = await createBuyNowPurchase({
        planCode,
        extraSites: 0,
        extraStorageGb,
        extraLeaderSeats: 0,
        selectedModules: learningModule ? ["LEARNING"] : undefined,
        successUrl,
        cancelUrl,
      });
      const warnings = response.warnings ?? [];
      setPreviewWarnings((prev) => Array.from(new Set([...prev, ...warnings])));
      window.location.href = response.sessionUrl;
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

  const renderWarnings = (warnings: string[]) => {
    if (!warnings?.length) return null;
    return (
      <div className="flex flex-wrap gap-2 text-xs">
        {warnings.map((w) => (
          <Badge key={w} variant="secondary">
            {warningCopy[w] ?? "Please review your selection."}
          </Badge>
        ))}
      </div>
    );
  };

  const selectedPlan = planOptions.find((p) => p.code === planTier);
  const mergedPlanPrices = { ...PLAN_PRICES, ...planPriceOverrides };
  const mergedAddonPrices = { ...ADDON_PRICES, ...addonPriceOverrides };
  const storageSuffix = billingPeriod === "yearly" ? "YEARLY" : "MONTHLY";
  const storageUnit = billingPeriod === "yearly" ? "year" : "month";
  const storage100 = mergedAddonPrices[`STORAGE_100GB_${storageSuffix}` as keyof typeof mergedAddonPrices];
  const storage200 = mergedAddonPrices[`STORAGE_200GB_${storageSuffix}` as keyof typeof mergedAddonPrices];
  const storage1tb = mergedAddonPrices[`STORAGE_1TB_${storageSuffix}` as keyof typeof mergedAddonPrices];
  const learningPrice = mergedAddonPrices[`MODULE_LEARNING_${storageSuffix}` as keyof typeof mergedAddonPrices];
  const storageOptions = [
    { value: "none", meta: null, label: "No additional storage" },
    {
      value: "100",
      meta: storage100,
      label: storage100
        ? `+100GB - £${formatAmount(storage100.amountMajor)} / ${storageUnit}`
        : `+100GB / ${storageUnit}`,
    },
    {
      value: "200",
      meta: storage200,
      label: storage200
        ? `+200GB - £${formatAmount(storage200.amountMajor)} / ${storageUnit}`
        : `+200GB / ${storageUnit}`,
    },
    {
      value: "1000",
      meta: storage1tb,
      label: storage1tb
        ? `+1TB - £${formatAmount(storage1tb.amountMajor)} / ${storageUnit}`
        : `+1TB / ${storageUnit}`,
    },
  ] as const;
  const totals = planCode
    ? calculateCartTotals(
        {
          planCode,
          storageChoice,
          learningModule,
        },
        {
          planPrices: mergedPlanPrices,
          addonPrices: mergedAddonPrices,
          excludePlanLine: isCurrentPlan,
        },
      )
    : { currency: "gbp", subtotalMajor: 0, totalMajor: 0, lines: [] };
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary font-heading">
            Buy Now
          </h1>
          <p className="text-sm text-text-muted">
            Choose a plan and capacity for your organisation. The allowance counts unique staff and volunteers with qualifying activity over the previous 30 days. Pricing is shown in checkout.
          </p>
        </div>
        <Link
          href="/billing"
          className="text-sm font-semibold text-accent-strong underline-offset-2 hover:underline"
        >
          ← Back to billing
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-[1.5fr_1fr]">
        <div className="space-y-4">
          <Card title="Plan selection">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-medium text-text-primary">Billing frequency:</p>
              <div className="relative flex h-11 items-center rounded-full border border-accent-primary bg-surface px-1">
                <span
                  className="absolute inset-y-1 left-1 w-[50%] rounded-full bg-accent-primary text-white shadow-sm transition-transform duration-150 ease-out"
                  style={{
                    transform: billingPeriod === "monthly" ? "translateX(0%)" : "translateX(100%)",
                  }}
                />
                {(["monthly", "yearly"] as const).map((freq) => (
                  <button
                    key={freq}
                    type="button"
                    onClick={() => setBillingPeriod(freq)}
                    className={`relative z-10 w-24 rounded-full px-3 py-2 text-sm font-semibold transition ${
                      billingPeriod === freq ? "text-white" : "text-text-muted hover:text-text-primary"
                    }`}
                  >
                    {freq === "monthly" ? "Monthly" : "Yearly"}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-3">
              {planOptions.map((plan) => {
                const isActive = planTier === plan.code;
                const cardPlanCode = (
                  plan.code === "ENTERPRISE_CONTACT"
                    ? "ENTERPRISE_CONTACT"
                    : plan.code === "STARTER"
                      ? billingPeriod === "monthly"
                        ? "STARTER_49_MONTHLY"
                        : "STARTER_49_YEARLY"
                      : plan.code === "GROWTH"
                        ? billingPeriod === "monthly"
                          ? "GROWTH_99_MONTHLY"
                          : "GROWTH_99_YEARLY"
                        : billingPeriod === "monthly"
                          ? "PROFESSIONAL_149_MONTHLY"
                          : "PROFESSIONAL_149_YEARLY"
                ) as PlanCode;
                const cardPrice = cardPlanCode !== "ENTERPRISE_CONTACT"
                  ? PLAN_PRICES[cardPlanCode]
                  : null;
                return (
                  <button
                    key={plan.code}
                    type="button"
                    onClick={() => setPlanTier(plan.code)}
                    className={`flex w-full items-start justify-between rounded-lg border px-4 py-3 text-left transition ${
                      isActive
                        ? "border-accent ring-2 ring-accent/40"
                        : "border-border-subtle hover:border-accent/60"
                    }`}
                  >
                    <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-text-primary">
                          {plan.label}
                        </span>
                        <Badge variant="secondary">
                          {plan.tier}
                        </Badge>
                        {cardPlanCode === currentPlanCode && (
                          <Badge variant="default" className="bg-accent-primary text-white">
                            Your current plan
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-text-muted">{plan.description}</p>
                      <p className="text-xs text-text-muted">
                        Active staff and volunteers: {plan.baseAv30 ?? "Custom"} · Sites:{" "}
                        {plan.baseSites ?? "Custom"}
                      </p>
                      {cardPrice && (
                        <p className="text-xs font-medium text-text-primary">{cardPrice.label}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card title="Add-ons">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="storageChoice">
                  Storage (billed {billingPeriod})
                </Label>
                <select
                  id="storageChoice"
                  value={storageChoice}
                  onChange={(e) => setStorageChoice(e.target.value as typeof storageChoice)}
                  className="w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm text-text-primary"
                >
                  {storageOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-text-muted">
                  Storage add-ons are charged as {billingPeriod} line items at checkout.
                </p>
              </div>
              <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border-subtle p-3 text-sm md:col-span-2">
                <input
                  type="checkbox"
                  checked={learningModule}
                  onChange={(event) => setLearningModule(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-border-subtle"
                />
                <span>
                  <span className="block font-medium text-text-primary">Learning module</span>
                  <span className="block text-text-muted">
                    £{formatAmount(learningPrice?.amountMajor ?? (billingPeriod === "yearly" ? 290 : 29))} / {billingPeriod === "yearly" ? "year" : "month"}
                  </span>
                  <span className="block text-xs text-text-muted">
                    Available to organisations other than home-education providers.
                  </span>
                </span>
              </label>
            </div>
          </Card>

          <Card title="Organisation contact">
            {isLoadingOrgInfo ? (
              <div className="space-y-2">
                <div className="h-10 w-full animate-pulse rounded bg-muted" />
                <div className="h-10 w-full animate-pulse rounded bg-muted" />
                <div className="h-10 w-full animate-pulse rounded bg-muted" />
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="orgName">Organisation name</Label>
                  <Input
                    id="orgName"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    required
                    disabled
                    className="bg-muted/50 cursor-not-allowed"
                  />
                  <p className="text-xs text-text-muted">
                    Pre-filled from your organisation profile
                  </p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="contactName">Contact name</Label>
                  <Input
                    id="contactName"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    required
                    disabled
                    className="bg-muted/50 cursor-not-allowed"
                  />
                  <p className="text-xs text-text-muted">
                    Pre-filled from organisation admin
                  </p>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label htmlFor="contactEmail">Contact email</Label>
                  <Input
                    id="contactEmail"
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    required
                    disabled
                    className="bg-muted/50 cursor-not-allowed"
                  />
                  <p className="text-xs text-text-muted">
                    Pre-filled from organisation admin
                  </p>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label htmlFor="notes">Notes (optional)</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any context for our team (kept internal)."
                  />
                  <p className="text-xs text-text-muted">
                    We'll use the organisation and contact details above for billing and receipts.
                  </p>
                </div>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Preview & pricing">
            <div className="space-y-3">
              {isPreviewLoading ? (
                <p className="text-sm text-text-muted">Loading preview…</p>
              ) : previewError ? (
                <div className="space-y-2 text-sm text-status-danger">
                  <p>{previewError}</p>
                  <Button size="sm" variant="secondary" onClick={() => void loadPreview()}>
                    Retry preview
                  </Button>
                </div>
              ) : preview ? (
                <div className="space-y-2 text-sm">
                  <p className="font-semibold text-text-primary">
                    {selectedPlan?.label ?? preview.planCode ?? "Selected plan"}
                  </p>
                  <p className="text-text-muted">
                    Active staff and volunteers: {preview.effectiveAv30Cap ?? "Custom / pending"}
                  </p>
                  <p className="text-text-muted">
                    Sites: {preview.effectiveSitesCap ?? "Custom / pending"}
                  </p>
                  <p className="text-text-muted">
                    Storage: {preview.effectiveStorageGbCap ?? "Not specified"}
                  </p>
                  <p className="text-text-muted">
                    SMS: {preview.effectiveSmsMessagesCap ?? "Not specified"}
                  </p>
                  <div className="my-4 h-px bg-border-subtle" />
                  <div className="space-y-2 text-sm">
                    {planCode === "ENTERPRISE_CONTACT" ? (
                      <p className="text-text-muted">Enterprise is bespoke. Contact sales.</p>
                    ) : isCurrentPlan && !totals.lines.length ? (
                      <p className="text-text-muted">Add add-ons above to see pricing (you're already on this plan).</p>
                    ) : totals.lines.length ? (
                      <>
                        {totals.lines.map((line) => (
                          <div key={line.label} className="flex items-center justify-between">
                            <span className="text-text-primary">{line.label}</span>
                            <span className="font-semibold">
                              £{formatAmount(line.amountMajor)}
                            </span>
                          </div>
                        ))}
                        <div className="my-2 h-px bg-border-subtle" />
                        <div className="flex items-center justify-between text-base font-semibold">
                          <span>Total</span>
                          <span>
                            £{formatAmount(totals.totalMajor)}
                          </span>
                        </div>
                        <p className="text-xs text-text-muted">
                          Final price and tax confirmed on Stripe-hosted checkout. Additional storage entered here is charged per backend configuration.
                        </p>
                      </>
                    ) : (
                      <p className="text-text-muted">Select a plan to see pricing.</p>
                    )}
                  </div>
                  {renderWarnings(previewWarnings)}
                </div>
              ) : (
                <p className="text-sm text-text-muted">
                  Select a plan to see the included caps.
                </p>
              )}
            </div>
          </Card>

          <Card title="Checkout">
            <div className="space-y-3 text-sm">
              <p className="text-text-muted">
                Continuing will open the checkout session with the current selection. No card
                details are collected in this app.
              </p>
              {checkoutError && (
                <div className="rounded-md border border-status-danger/30 bg-status-danger/5 px-3 py-2 text-xs text-status-danger">
                  {checkoutError}
                </div>
              )}
              {isCurrentPlan && !hasAddons && (
                <p className="text-xs text-text-muted">
                  Add add-ons above to checkout, or choose a different plan.
                </p>
              )}
              {isCurrentPlan && hasAddons && (
                <p className="text-xs text-text-muted">
                  Checkout will charge only for add-ons (you're already on this plan).
                </p>
              )}
              <Button
                className="w-full"
                onClick={handleCheckout}
                disabled={isCheckoutLoading || (isCurrentPlan && !hasAddons)}
              >
                {isCheckoutLoading ? "Starting checkout..." : "Continue to checkout"}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
