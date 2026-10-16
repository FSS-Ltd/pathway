"use client";

import React from "react";
import Link from "next/link";
import { loadStripe } from "@stripe/stripe-js";
import { Button, Card } from "@pathway/ui";
import {
  acceptDeclaredCapacityCapacityQuote,
  createDeclaredCapacityCapacityQuote,
  fetchDeclaredCapacityBillingSummary,
  type DeclaredCapacityBillingSummary,
  type DeclaredCapacityCapacityQuote,
} from "../../lib/institutional-billing-client";
import { DeclaredCapacityAddonManager } from "./declared-capacity-addon-manager";

function money(pence: number | null): string {
  return pence === null
    ? "Under review"
    : new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
      }).format(pence / 100);
}

function date(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Not set";
}

function tierFor(capacity: number): string {
  if (capacity >= 251) return "Enterprise";
  if (capacity >= 150) return "Professional";
  if (capacity >= 75) return "Growth";
  return "Starter";
}

function validCapacity(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function DeclaredCapacityBilling() {
  const [summary, setSummary] =
    React.useState<DeclaredCapacityBillingSummary | null>(null);
  const [capacityInput, setCapacityInput] = React.useState("");
  const [quote, setQuote] =
    React.useState<DeclaredCapacityCapacityQuote | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const acceptanceKey = React.useRef<{
    snapshotId: string;
    key: string;
  } | null>(null);

  const reload = React.useCallback(async () => {
    setError(null);
    try {
      const result = await fetchDeclaredCapacityBillingSummary();
      setSummary(result);
      const currentCapacity = result.currentPaid?.declaredCapacity;
      if (currentCapacity !== null && currentCapacity !== undefined) {
        setCapacityInput(String(currentCapacity));
      }
    } catch {
      setError(
        "Billing information is unavailable. Check your access and retry.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const currentCapacity = summary?.currentPaid?.declaredCapacity ?? null;
  const currentPlanCode = summary?.currentPaid?.planCode ?? "";
  const currentPeriodEnd = summary?.currentPaid?.periodEnd ?? null;
  const isDeclaredCapacitySubscription = Boolean(
    summary?.currentPaid?.planCode.startsWith("DECLARED_CAPACITY_") &&
    currentCapacity !== null,
  );
  const requestedCapacity = validCapacity(capacityInput);

  const previewCapacityChange = async () => {
    if (
      requestedCapacity === null ||
      currentCapacity === null ||
      !isDeclaredCapacitySubscription ||
      requestedCapacity === currentCapacity
    ) {
      return;
    }
    setPending(true);
    setError(null);
    setNotice(null);
    setQuote(null);
    acceptanceKey.current = null;
    try {
      const result =
        await createDeclaredCapacityCapacityQuote(requestedCapacity);
      setQuote(result);
    } catch {
      setError(
        "A capacity quote could not be created. Confirm your roll and site allowance, then retry.",
      );
    } finally {
      setPending(false);
    }
  };

  const acceptCapacityChange = async () => {
    if (!quote || pending) return;
    setPending(true);
    setError(null);
    setNotice(null);
    acceptanceKey.current ??= {
      snapshotId: quote.id,
      key: crypto.randomUUID(),
    };
    try {
      const accepted = await acceptDeclaredCapacityCapacityQuote(
        quote.id,
        acceptanceKey.current.key,
      );
      if (accepted.kind === "scheduled_decrease") {
        setNotice("Your capacity decrease is scheduled for the next renewal.");
        setQuote(null);
        await reload();
        return;
      }
      if (accepted.kind === "payment_pending") {
        if (accepted.paymentIntentClientSecret) {
          if (!accepted.publishableKey) {
            throw new Error(
              "This payment needs card authentication, but Stripe is not configured for the secure payment step. The capacity increase is not active.",
            );
          }
          const stripe = await loadStripe(accepted.publishableKey);
          if (!stripe) {
            throw new Error(
              "Secure payment could not be prepared. The capacity increase is not active.",
            );
          }
          const result = await stripe.confirmCardPayment(
            accepted.paymentIntentClientSecret,
          );
          if (result.error) {
            throw new Error(
              result.error.message ??
                "Card authentication was not completed. The capacity increase is not active.",
            );
          }
          if (result.paymentIntent?.status !== "succeeded") {
            setNotice(
              "Stripe is processing payment. The higher capacity becomes active only after billing confirms payment.",
            );
          } else {
            setNotice(
              "Payment was confirmed. The higher capacity becomes active after the billing confirmation arrives.",
            );
          }
        } else {
          setNotice(
            "Payment is processing. The higher capacity becomes active only after billing confirms payment.",
          );
        }
        setQuote(null);
        await reload();
        return;
      }
      setNotice("The capacity change is active.");
      setQuote(null);
      await reload();
    } catch (caught: unknown) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The capacity change could not be completed. Retry or contact billing support.",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="space-y-5">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-accent-strong">
          Billing
        </p>
        <h1 className="mt-1 font-heading text-3xl font-bold">
          Institutional subscription
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-text-muted">
          Manage declared child capacity and optional add-on trials. Capacity
          changes are confirmed against the provider before taking effect.
        </p>
        {!loading && summary ? (
          <p className="mt-2 max-w-3xl text-sm text-text-muted">
            {summary.pricesIncludeVat
              ? "Displayed prices include VAT. Checkout confirms the final amount."
              : "VAT is not currently charged. If VAT registration becomes required, VAT will be included within this price."}
          </p>
        ) : null}
      </header>
      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-status-danger/10 p-4 text-sm text-status-danger"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="rounded-lg bg-status-success/10 p-4 text-sm text-status-success"
        >
          {notice}
        </p>
      ) : null}
      {loading ? (
        <p role="status" className="text-sm text-text-muted">
          Loading billing…
        </p>
      ) : null}
      {!loading && summary?.currentPaid ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Current subscription">
            <div className="space-y-2 text-sm">
              <p className="text-xl font-bold">
                {currentCapacity === null
                  ? "Capacity under review"
                  : `${tierFor(currentCapacity)} · ${currentCapacity} children`}
              </p>
              <p>
                {money(summary.currentPaid.subtotalPence)} per{" "}
                {summary.currentPaid.planCode.endsWith("_YEARLY")
                  ? "year"
                  : "month"}
              </p>
              <p className="text-text-muted">
                Current period ends {date(summary.currentPaid.periodEnd)}.
              </p>
            </div>
          </Card>
          <Card title="Scheduled capacity decrease">
            {summary.scheduledChange?.declaredCapacity !== null &&
            summary.scheduledChange?.declaredCapacity !== undefined ? (
              <div className="space-y-2 text-sm">
                <p className="text-xl font-bold">
                  {summary.scheduledChange.declaredCapacity} children
                </p>
                <p className="text-text-muted">
                  Effective {date(summary.scheduledChange.effectiveAt)}.
                </p>
              </div>
            ) : (
              <p className="text-sm text-text-muted">
                No capacity decrease is scheduled.
              </p>
            )}
          </Card>
          <Card title="Pending capacity payment">
            {summary.pendingCapacityChange ? (
              <div className="space-y-2 text-sm">
                <p className="font-semibold">
                  {summary.pendingCapacityChange.declaredCapacity} children
                  requested
                </p>
                <p>
                  {money(summary.pendingCapacityChange.amountDueNowPence)} due
                  now
                </p>
                <p className="text-text-muted">
                  The new hard limit stays unchanged until payment confirmation
                  is processed.
                </p>
                <Button size="sm" onClick={() => void reload()}>
                  Refresh status
                </Button>
              </div>
            ) : (
              <p className="text-sm text-text-muted">
                No upgrade payment is pending.
              </p>
            )}
          </Card>
        </div>
      ) : null}
      {!loading && !isDeclaredCapacitySubscription ? (
        <Card title="Declared-capacity management unavailable">
          <p className="text-sm text-text-muted">
            This organisation does not have an active declared-capacity
            subscription. Contact billing support for account changes.
          </p>
        </Card>
      ) : null}
      {!loading &&
      isDeclaredCapacitySubscription &&
      currentCapacity !== null ? (
        <Card title="Change declared capacity">
          <div className="space-y-4">
            <div className="max-w-sm space-y-2">
              <label
                htmlFor="new-declared-capacity"
                className="block text-sm font-semibold"
              >
                New child capacity
              </label>
              <input
                id="new-declared-capacity"
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={capacityInput}
                onChange={(event) => {
                  setCapacityInput(event.target.value);
                  setQuote(null);
                  acceptanceKey.current = null;
                }}
                className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
              />
              {requestedCapacity !== null ? (
                <p className="text-sm text-text-muted">
                  {requestedCapacity >= 251
                    ? "Enterprise custom quote"
                    : `${tierFor(requestedCapacity)} · ${requestedCapacity} children`}
                </p>
              ) : (
                <p className="text-xs text-status-danger">
                  Enter a whole number including zero.
                </p>
              )}
            </div>
            {requestedCapacity !== null && requestedCapacity >= 251 ? (
              <Link
                href="/demo?plan=enterprise"
                className="inline-block font-semibold text-accent-strong underline"
              >
                Contact Nexsteps about Enterprise
              </Link>
            ) : (
              <Button
                size="sm"
                disabled={
                  pending ||
                  requestedCapacity === null ||
                  requestedCapacity === currentCapacity
                }
                onClick={() => void previewCapacityChange()}
              >
                {pending && !quote
                  ? "Preparing quote…"
                  : "Get exact capacity quote"}
              </Button>
            )}
            {quote ? (
              <div className="max-w-2xl rounded-xl border border-accent-primary bg-accent-primary/5 p-4">
                <h3 className="font-semibold">
                  Review the provider-backed quote
                </h3>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-text-muted">New recurring total</dt>
                    <dd className="font-semibold">
                      {money(quote.subtotalPence)} per{" "}
                      {currentPlanCode.endsWith("_YEARLY") ? "year" : "month"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-text-muted">
                      {quote.declaredCapacity < currentCapacity
                        ? "Due today"
                        : "Prorated amount due now"}
                    </dt>
                    <dd className="font-semibold">
                      {money(quote.amountDueNowPence ?? 0)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-text-muted">Quote expires</dt>
                    <dd>{date(quote.expiresAt)}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs text-text-muted">
                  {quote.declaredCapacity < currentCapacity
                    ? `The lower capacity applies at renewal on ${date(currentPeriodEnd)}. It cannot go below the active enrolment count or the site allowance.`
                    : "The capacity limit rises only after the prorated payment is confirmed by Stripe and its webhook is processed."}
                </p>
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => void acceptCapacityChange()}
                  className="mt-4"
                >
                  {pending
                    ? "Confirming…"
                    : quote.declaredCapacity < currentCapacity
                      ? "Confirm decrease for next renewal"
                      : `Confirm increase and pay ${money(quote.amountDueNowPence ?? 0)}`}
                </Button>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}
      {!loading && isDeclaredCapacitySubscription ? (
        <DeclaredCapacityAddonManager />
      ) : null}
    </main>
  );
}
