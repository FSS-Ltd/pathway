"use client";

import React from "react";
import Link from "next/link";
import { useSession } from "@/lib/use-session-compat";
import { Button, Card } from "@pathway/ui";
import {
  isDeclaredCapacityV2ConfiguratorEnabled,
  isMappedInstitutionalPlanCode,
  type InstitutionalMappedPlanCode,
  type InstitutionalMappedQuote,
  type InstitutionalStorageChoice,
} from "@pathway/pricing";
import { DeclaredCapacityBilling } from "../../../components/billing/declared-capacity-billing";
import {
  acceptInstitutionalQuote,
  checkoutInstitutionalQuote,
  createInstitutionalQuote,
  estimateInstitutionalQuote,
  fetchInstitutionalCatalogue,
  fetchInstitutionalSummary,
  type InstitutionalCatalogue,
  type InstitutionalQuote,
  type InstitutionalSummary,
} from "../../../lib/institutional-billing-client";
import { InstitutionalSummaryCards } from "../../../components/billing/institutional-summary";
import {
  BillingReviewStep,
  BillingRunningTotal,
} from "../../../components/billing/institutional-configurator-review";
import {
  BILLING_STEPS,
  BILLING_STEP_LABELS,
  BillingModulesStep,
  BillingPlanStep,
  BillingPupilsStep,
  BillingStorageStep,
  type BillingStep,
} from "../../../components/billing/institutional-configurator-steps";

const STORAGE_KEY_PREFIX = "nexsteps-institutional-billing:";

function savedSelection(
  userId: string,
  orgId: string,
): {
  planCode: InstitutionalMappedPlanCode;
  storageChoice: InstitutionalStorageChoice;
  declaredCount: string;
  declarationAccepted: boolean;
} | null {
  try {
    const raw = window.sessionStorage.getItem(
      `${STORAGE_KEY_PREFIX}${userId}:${orgId}`,
    );
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const record = value as Record<string, unknown>;
    if (
      typeof record.planCode !== "string" ||
      !isMappedInstitutionalPlanCode(record.planCode)
    )
      return null;
    if (
      record.storageChoice !== "none" &&
      record.storageChoice !== "100" &&
      record.storageChoice !== "200" &&
      record.storageChoice !== "1000"
    )
      return null;
    if (typeof record.declaredCount !== "string") return null;
    return {
      planCode: record.planCode,
      storageChoice: record.storageChoice,
      declaredCount: record.declaredCount,
      declarationAccepted: record.declarationAccepted === true,
    };
  } catch {
    return null;
  }
}

function selectedCount(
  summary: InstitutionalSummary,
  declared: string,
): number | null {
  if (summary.currentPaid) {
    return summary.countSource === "VERIFIED" && summary.liveForecast
      ? summary.liveForecast.enrolledChildren
      : null;
  }
  if (declared.trim() === "") return null;
  const count = Number(declared);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

function currentStorageChoice(
  summary: InstitutionalSummary,
): InstitutionalStorageChoice {
  const storageLine = summary.currentPaid?.lines.find(
    (line) => line.component === "STORAGE",
  );
  const priceCode =
    storageLine && "priceCode" in storageLine
      ? storageLine.priceCode
      : undefined;
  if (priceCode?.startsWith("STORAGE_100GB_")) return "100";
  if (priceCode?.startsWith("STORAGE_200GB_")) return "200";
  if (priceCode?.startsWith("STORAGE_1TB_")) return "1000";
  return "none";
}

function LegacyInstitutionalBillingPage() {
  const { data: session, status } = useSession();
  const userId = session?.user.id;
  const [summary, setSummary] = React.useState<InstitutionalSummary | null>(
    null,
  );
  const [catalogue, setCatalogue] =
    React.useState<InstitutionalCatalogue | null>(null);
  const [step, setStep] = React.useState<BillingStep>("plan");
  const [planCode, setPlanCode] = React.useState<InstitutionalMappedPlanCode>(
    "INSTITUTIONAL_STARTER_MONTHLY",
  );
  const [storageChoice, setStorageChoice] =
    React.useState<InstitutionalStorageChoice>("none");
  const [declaredCount, setDeclaredCount] = React.useState("");
  const [declarationAccepted, setDeclarationAccepted] = React.useState(false);
  const [estimate, setEstimate] =
    React.useState<InstitutionalMappedQuote | null>(null);
  const [quote, setQuote] = React.useState<InstitutionalQuote | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [pricingPending, setPricingPending] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [priceError, setPriceError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [checkoutPendingConfirmation, setCheckoutPendingConfirmation] =
    React.useState(false);
  const [retry, setRetry] = React.useState(0);
  const [selectionReady, setSelectionReady] = React.useState(false);
  const requestRef = React.useRef(0);
  const keyRef = React.useRef<{ quoteId: string; key: string } | null>(null);

  const reload = React.useCallback(async () => {
    setError(null);
    try {
      const [nextSummary, nextCatalogue] = await Promise.all([
        fetchInstitutionalSummary(),
        fetchInstitutionalCatalogue(),
      ]);
      setSummary(nextSummary);
      setCatalogue(nextCatalogue);
      const saved =
        userId && nextSummary.orgId
          ? savedSelection(userId, nextSummary.orgId)
          : null;
      setPlanCode(
        saved?.planCode ??
          nextSummary.scheduledChange?.planCode ??
          nextSummary.currentPaid?.planCode ??
          "INSTITUTIONAL_STARTER_MONTHLY",
      );
      setStorageChoice(
        saved?.storageChoice ?? currentStorageChoice(nextSummary),
      );
      setDeclaredCount(
        !nextSummary.currentPaid ? (saved?.declaredCount ?? "") : "",
      );
      setDeclarationAccepted(
        !nextSummary.currentPaid && saved?.declarationAccepted === true,
      );
      setSelectionReady(true);
    } catch {
      setError(
        "Billing information is unavailable. Check your access and retry.",
      );
    } finally {
      setLoading(false);
    }
  }, [userId]);

  React.useEffect(() => {
    if (status === "authenticated" && session) void reload();
  }, [status, session, reload]);

  React.useEffect(() => {
    if (!selectionReady || !userId || !summary?.orgId) return;
    try {
      window.sessionStorage.setItem(
        `${STORAGE_KEY_PREFIX}${userId}:${summary.orgId}`,
        JSON.stringify({
          planCode,
          storageChoice,
          declaredCount,
          declarationAccepted,
        }),
      );
    } catch {
      // Storage is optional; the server validates each submitted quote.
    }
  }, [
    userId,
    summary,
    selectionReady,
    planCode,
    storageChoice,
    declaredCount,
    declarationAccepted,
  ]);

  React.useEffect(() => {
    const checkout = new URLSearchParams(window.location.search).get(
      "checkout",
    );
    if (checkout === "cancelled")
      setNotice(
        "Payment was cancelled. Your choices are still here for review.",
      );
    if (checkout === "pending") {
      setCheckoutPendingConfirmation(true);
      setNotice(
        "Payment is being confirmed. Your workspace will activate after Stripe confirms payment.",
      );
    }
  }, []);

  const count = summary ? selectedCount(summary, declaredCount) : null;
  React.useEffect(() => {
    const request = ++requestRef.current;
    if (count === null) {
      setEstimate(null);
      setPriceError(null);
      return;
    }
    setPricingPending(true);
    setPriceError(null);
    void estimateInstitutionalQuote(planCode, count, storageChoice)
      .then((result) => {
        if (request === requestRef.current) setEstimate(result);
      })
      .catch(() => {
        if (request === requestRef.current) {
          setEstimate(null);
          setPriceError(
            "A selected price is unavailable. Retry or choose another option.",
          );
        }
      })
      .finally(() => {
        if (request === requestRef.current) setPricingPending(false);
      });
  }, [planCode, storageChoice, count, retry]);

  const changeSelection = (change: () => void) => {
    requestRef.current += 1;
    setQuote(null);
    setEstimate(null);
    setError(null);
    setNotice(null);
    keyRef.current = null;
    change();
  };

  const preview = async () => {
    if (
      !summary ||
      count === null ||
      estimate?.kind !== "priced" ||
      pricingPending
    )
      return;
    setPending(true);
    setError(null);
    setQuote(null);
    try {
      const result = await createInstitutionalQuote(
        planCode,
        storageChoice,
        summary.currentPaid ? undefined : count,
      );
      setQuote(result);
      if (result.status !== "PRICED")
        setError(
          "This pupil count needs a tailored quote. Contact support to continue.",
        );
    } catch {
      setError(
        "The quote could not be created. A confirmed roll or available Stripe price may be required. Retry after checking your details.",
      );
    } finally {
      setPending(false);
    }
  };

  const accept = async () => {
    if (!quote || quote.status !== "PRICED" || !summary) return;
    setPending(true);
    setError(null);
    const key =
      keyRef.current?.quoteId === quote.id
        ? keyRef.current.key
        : crypto.randomUUID();
    keyRef.current = { quoteId: quote.id, key };
    try {
      await acceptInstitutionalQuote(quote.id, key);
      if (summary.currentPaid) {
        setNotice(
          "Your change is scheduled for the next eligible renewal. Current access and charges remain in place until then.",
        );
        setQuote(null);
        await reload();
      } else {
        const checkout = await checkoutInstitutionalQuote(quote.id, key);
        window.location.assign(checkout.checkoutUrl);
      }
    } catch {
      setError(
        "The quote expired, changed, or checkout is unavailable. Request a fresh quote before continuing.",
      );
      setQuote(null);
    } finally {
      setPending(false);
    }
  };

  if (status === "unauthenticated")
    return (
      <Card title="Sign in required">
        <p className="text-sm text-text-muted">
          Sign in to view your organisation’s billing.
        </p>
        <Link href="/login" className="text-sm text-accent-strong underline">
          Sign in
        </Link>
      </Card>
    );
  if (status !== "authenticated" || loading)
    return (
      <p role="status" className="text-sm text-text-muted">
        Loading billing…
      </p>
    );
  if (!summary || !catalogue)
    return (
      <Card title="Billing unavailable">
        <p role="alert" className="text-sm text-status-danger">
          {error}
        </p>
        <Button size="sm" onClick={() => void reload()}>
          Retry
        </Button>
      </Card>
    );

  const planAvailable =
    catalogue.plans.find((plan) => plan.planCode === planCode)?.available ===
    true;
  const stepIndex = BILLING_STEPS.indexOf(step);
  const canReview =
    count !== null &&
    (!checkoutPendingConfirmation || Boolean(summary.currentPaid)) &&
    (summary.currentPaid || declarationAccepted) &&
    estimate?.kind === "priced" &&
    !pricingPending &&
    !priceError;

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <Link
          href="/billing"
          className="text-sm font-semibold text-accent-strong hover:underline"
        >
          ← Billing overview
        </Link>
        <h1 className="font-heading text-2xl font-bold text-text-primary sm:text-3xl">
          Configure institutional billing
        </h1>
        <p className="text-sm text-text-muted">
          Review the confirmed roll, choose your plan and storage, then accept a
          Stripe-backed quote.
        </p>
      </header>
      <InstitutionalSummaryCards summary={summary} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr),minmax(280px,0.65fr)]">
        <div className="min-w-0">
          <Card title="Your configuration">
            <nav
              aria-label="Billing configuration progress"
              className="mb-6 overflow-x-auto"
            >
              <ol className="flex min-w-max gap-2 pb-2 text-xs sm:flex-wrap">
                {BILLING_STEPS.map((item, index) => (
                  <li
                    key={item}
                    aria-current={step === item ? "step" : undefined}
                    className={`rounded-full px-3 py-1.5 ${step === item ? "bg-accent-primary text-accent-foreground" : "bg-surface text-text-muted"}`}
                  >
                    {index + 1}. {BILLING_STEP_LABELS[item]}
                  </li>
                ))}
              </ol>
            </nav>
            {step === "plan" && (
              <BillingPlanStep
                catalogue={catalogue}
                selected={planCode}
                onSelect={(value) => changeSelection(() => setPlanCode(value))}
              />
            )}
            {step === "pupils" && (
              <BillingPupilsStep
                summary={summary}
                declaredCount={declaredCount}
                onDeclaredCount={(value) =>
                  changeSelection(() => setDeclaredCount(value))
                }
              />
            )}
            {step === "modules" && <BillingModulesStep summary={summary} />}
            {step === "storage" && (
              <BillingStorageStep
                choice={storageChoice}
                onSelect={(value) =>
                  changeSelection(() => setStorageChoice(value))
                }
              />
            )}
            {step === "review" && (
              <BillingReviewStep
                summary={summary}
                quote={quote}
                estimate={estimate}
                declarationAccepted={declarationAccepted}
                onDeclarationChange={setDeclarationAccepted}
                pending={pending}
                canReview={Boolean(canReview)}
                onPreview={() => void preview()}
                onAccept={() => void accept()}
              />
            )}
            {error && (
              <p role="alert" className="mt-4 text-sm text-status-danger">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="mt-4 text-sm text-status-success">
                {notice}
              </p>
            )}
            <div className="mt-6 flex justify-between border-t border-border-subtle pt-4">
              <Button
                size="sm"
                disabled={stepIndex === 0}
                onClick={() => setStep(BILLING_STEPS[stepIndex - 1])}
              >
                Back
              </Button>
              {step !== "review" && (
                <Button
                  size="sm"
                  disabled={step === "plan" && !planAvailable}
                  onClick={() => setStep(BILLING_STEPS[stepIndex + 1])}
                >
                  Continue
                </Button>
              )}
            </div>
          </Card>
        </div>
        <aside className="min-w-0 space-y-4 lg:sticky lg:top-24 lg:self-start">
          <BillingRunningTotal
            summary={summary}
            quote={quote}
            estimate={estimate}
            priceError={priceError}
            pricingPending={pricingPending}
            onRetry={() => setRetry((value) => value + 1)}
          />
        </aside>
      </div>
    </main>
  );
}

export default function InstitutionalBillingPage() {
  return isDeclaredCapacityV2ConfiguratorEnabled(
    process.env.NEXT_PUBLIC_DECLARED_CAPACITY_V2_CONFIGURATOR,
  ) ? (
    <DeclaredCapacityBilling />
  ) : (
    <LegacyInstitutionalBillingPage />
  );
}
