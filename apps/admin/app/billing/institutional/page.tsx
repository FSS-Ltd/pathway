"use client";

import React from "react";
import Link from "next/link";
import { useSession } from "@/lib/use-session-compat";
import { Card, Button } from "@pathway/ui";
import {
  INSTITUTIONAL_PLANS,
  type InstitutionalPlanCode,
} from "@pathway/pricing";
import {
  acceptInstitutionalQuote,
  createInstitutionalQuote,
  fetchInstitutionalSummary,
  type InstitutionalQuote,
  type InstitutionalSummary,
} from "../../../lib/institutional-billing-client";
import {
  InstitutionalSummaryCards,
  money,
  date,
} from "../../../components/billing/institutional-summary";

export default function InstitutionalBillingPage() {
  const { data: session, status } = useSession();
  const [summary, setSummary] = React.useState<InstitutionalSummary | null>(
    null,
  );
  const [planCode, setPlanCode] = React.useState<InstitutionalPlanCode>(
    "INSTITUTIONAL_STARTER_MONTHLY",
  );
  const [quote, setQuote] = React.useState<InstitutionalQuote | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const keyRef = React.useRef<{ quoteId: string; key: string } | null>(null);
  const previewRequestRef = React.useRef(0);
  const hasCurrentOptionalModules = Boolean(
    summary?.currentPaid &&
    (summary.currentPaid.includedModules.length ||
      summary.currentPaid.paidModules.length),
  );

  const reload = React.useCallback(async () => {
    setError(null);
    try {
      const result = await fetchInstitutionalSummary();
      setSummary(result);
      if (result.scheduledChange) setPlanCode(result.scheduledChange.planCode);
      else if (result.currentPaid) setPlanCode(result.currentPaid.planCode);
    } catch {
      setError(
        "Billing information could not be loaded. Check your billing access and try again.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (status === "authenticated" && session) void reload();
  }, [status, session, reload]);

  const preview = async () => {
    const requestId = ++previewRequestRef.current;
    setPending(true);
    setError(null);
    setNotice(null);
    setQuote(null);
    try {
      const result = await createInstitutionalQuote(planCode);
      if (requestId === previewRequestRef.current) setQuote(result);
    } catch {
      if (requestId === previewRequestRef.current) {
        setError(
          "A confirmed enrolment roll is required before a plan change can be priced. Please confirm the roll or contact support.",
        );
      }
    } finally {
      if (requestId === previewRequestRef.current) setPending(false);
    }
  };

  const accept = async () => {
    if (!quote) return;
    setPending(true);
    setError(null);
    const key =
      keyRef.current?.quoteId === quote.id
        ? keyRef.current.key
        : crypto.randomUUID();
    keyRef.current = { quoteId: quote.id, key };
    try {
      await acceptInstitutionalQuote(quote.id, key);
      setQuote(null);
      setNotice(
        "Your choice has been recorded for an eligible renewal. Your current paid plan is unchanged.",
      );
      await reload();
    } catch {
      setError(
        "This quote may have expired or the enrolment roll changed. Review a fresh quote before accepting.",
      );
      setQuote(null);
    } finally {
      setPending(false);
    }
  };

  if (status === "unauthenticated") {
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
  }
  if (status !== "authenticated" || loading) {
    return (
      <p role="status" className="text-sm text-text-muted">
        Loading billing…
      </p>
    );
  }
  if (error && !summary) {
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
  }

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <Link
          href="/billing"
          className="text-sm font-semibold text-accent-strong underline-offset-2 hover:underline"
        >
          ← Billing overview
        </Link>
        <h1 className="font-heading text-2xl font-bold text-text-primary sm:text-3xl">
          Enrolled-child billing
        </h1>
        <p className="text-sm text-text-muted">
          A clear view of what is paid now, what the confirmed roll suggests,
          and what has been frozen for renewal.
        </p>
      </header>
      {summary ? <InstitutionalSummaryCards summary={summary} /> : null}
      {summary?.currentPaid ? (
        <Card title="Review a plan change">
          <div className="space-y-4">
            <p className="text-sm text-text-muted">
              Plan and module changes take effect at an eligible renewal without
              proration. Optional modules are not yet ready for new selection.
              Your current access stays in place until the paid period changes.
            </p>
            <label htmlFor="next-plan" className="block text-sm font-semibold">
              Next plan
            </label>
            <select
              id="next-plan"
              value={planCode}
              onChange={(event) => {
                previewRequestRef.current += 1;
                setPending(false);
                setPlanCode(event.target.value as InstitutionalPlanCode);
                setQuote(null);
              }}
              className="w-full max-w-sm rounded-lg border border-border-subtle bg-surface p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
            >
              {Object.values(INSTITUTIONAL_PLANS).map((plan) => (
                <option key={plan.code} value={plan.code}>
                  {plan.tier} · {money(plan.basePence)} base / month ·{" "}
                  {plan.includedChildren} included
                </option>
              ))}
            </select>
            {hasCurrentOptionalModules ? (
              <p className="text-sm text-text-muted">
                Your current optional modules need a separate billing review
                before this plan can change. They will not be silently removed.
              </p>
            ) : null}
            <div>
              <Button
                size="sm"
                disabled={pending || hasCurrentOptionalModules}
                onClick={() => void preview()}
              >
                {pending ? "Checking…" : "Review authoritative quote"}
              </Button>
            </div>
            {quote ? (
              <div
                aria-live="polite"
                className="space-y-3 rounded-lg border border-border-subtle p-4"
              >
                <p className="text-sm">
                  {INSTITUTIONAL_PLANS[quote.planCode].tier} quote:{" "}
                  {quote.status === "PRICED"
                    ? `${money(quote.subtotalPence)} / month for ${quote.enrolledChildren} enrolled children`
                    : "Custom quote required"}
                </p>
                <p className="text-xs text-text-muted">
                  Expires {date(quote.expiresAt)}. No charge is made today.
                </p>
                {quote.status === "PRICED" ? (
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() => void accept()}
                  >
                    Accept change
                  </Button>
                ) : null}
              </div>
            ) : null}
            {notice ? (
              <p role="status" className="text-sm text-status-success">
                {notice}
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-status-danger">
                {error}
              </p>
            ) : null}
          </div>
        </Card>
      ) : null}
    </main>
  );
}
