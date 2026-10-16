"use client";

import React from "react";
import Link from "next/link";
import {
  decideDeclaredCapacityAddonTrial,
  fetchDeclaredCapacityAddonPriceReview,
  fetchDeclaredCapacityAddonTrials,
  startDeclaredCapacityAddonCheckout,
  type DeclaredCapacityAddonPriceReview,
  type DeclaredCapacityAddonTrials,
} from "../../lib/institutional-billing-client";
import { DECLARED_CAPACITY_TRIAL_REVIEW_EVENT } from "./declared-capacity-trial-events";
import { MODULE_CATALOG } from "../../lib/module-catalog";
import {
  ADDON_TRIAL_WARNING_WINDOW_MS,
  shouldShowAddonTrialCountdown,
  trialTimeRemaining,
} from "../../lib/declared-capacity-trial-ui";

const DISMISSED_PREFIX = "nexsteps-addon-expiry-dismissed:";

function moduleLabel(module: string): string {
  return MODULE_CATALOG[module as keyof typeof MODULE_CATALOG]?.label ?? module;
}

function money(pence: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

function isDismissed(module: string): boolean {
  try {
    return (
      window.sessionStorage.getItem(`${DISMISSED_PREFIX}${module}`) === "true"
    );
  } catch {
    return false;
  }
}

function dismissForSession(module: string): void {
  try {
    window.sessionStorage.setItem(`${DISMISSED_PREFIX}${module}`, "true");
  } catch {
    // A dismissal is best-effort; the billing page remains available.
  }
}

export function DeclaredCapacityTrialNotices({
  enabled,
}: {
  enabled: boolean;
}) {
  const [trials, setTrials] =
    React.useState<DeclaredCapacityAddonTrials | null>(null);
  const [openModule, setOpenModule] = React.useState<string | null>(null);
  const [review, setReview] =
    React.useState<DeclaredCapacityAddonPriceReview | null>(null);
  const [interval, setInterval] = React.useState<"MONTHLY" | "YEARLY" | null>(
    null,
  );
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [noticeStage, setNoticeStage] = React.useState<"decision" | "price">(
    "decision",
  );
  const [now, setNow] = React.useState(() => Date.now());
  const dialogRef = React.useRef<HTMLElement | null>(null);
  const firstActionRef = React.useRef<HTMLButtonElement | null>(null);
  const restoreFocusRef = React.useRef<HTMLElement | null>(null);

  const reload = React.useCallback(async () => {
    if (!enabled) return;
    try {
      const result = await fetchDeclaredCapacityAddonTrials();
      setTrials(result);
      setError(null);
    } catch {
      setError("Trial information is unavailable right now.");
    }
  }, [enabled]);

  React.useEffect(() => {
    if (!enabled) return;
    void reload();
  }, [enabled, reload]);

  React.useEffect(() => {
    if (!enabled || !trials) return;
    const activeTrials = trials.trials.filter(
      (trial) => trial.status === "ACTIVE" && trial.expiresAt,
    );
    if (activeTrials.length === 0) return;

    const warningWindowOpen = activeTrials.some((trial) =>
      shouldShowAddonTrialCountdown(trial.status, trial.expiresAt, now),
    );
    const nextWarningAt = Math.min(
      ...activeTrials
        .map(
          (trial) =>
            new Date(trial.expiresAt ?? "").getTime() -
            ADDON_TRIAL_WARNING_WINDOW_MS,
        )
        .filter((time) => time > now),
    );
    const delay = warningWindowOpen
      ? 60_000
      : Number.isFinite(nextWarningAt)
        ? Math.max(0, nextWarningAt - now)
        : null;
    if (delay === null) return;

    const timeout = window.setTimeout(() => setNow(Date.now()), delay);
    return () => window.clearTimeout(timeout);
  }, [enabled, now, trials]);

  React.useEffect(() => {
    if (!enabled || !trials) return;
    const expiries = trials.trials
      .filter((trial) => trial.status === "ACTIVE" && trial.expiresAt !== null)
      .map((trial) => new Date(trial.expiresAt ?? "").getTime());
    if (expiries.length === 0) return;

    const nextExpiry = Math.min(...expiries);
    const expiryPassed = nextExpiry <= now;
    const delay = expiryPassed ? 60_000 : Math.max(0, nextExpiry - now);
    const timeout = window.setTimeout(() => {
      const currentTime = Date.now();
      setNow(currentTime);
      if (nextExpiry <= currentTime) void reload();
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [enabled, now, reload, trials]);

  const openReview = React.useCallback(
    async (module: string) => {
      const activeElement = document.activeElement;
      restoreFocusRef.current =
        activeElement instanceof HTMLElement && activeElement !== document.body
          ? activeElement
          : null;
      setOpenModule(module);
      setReview(null);
      setInterval(null);
      setNoticeStage("decision");
      setError(null);
      const trial = trials?.trials.find((item) => item.module === module);
      if (trial?.status === "EXPIRED" && trial.decisionRecorded) {
        setNoticeStage("price");
        try {
          setReview(await fetchDeclaredCapacityAddonPriceReview(module));
        } catch {
          setError(
            "Approved prices could not be loaded. Retry from Billing when they are available.",
          );
        }
      }
    },
    [trials],
  );

  React.useEffect(() => {
    if (!enabled) return;
    const onReviewRequest = (event: Event) => {
      const requestedModule = (event as CustomEvent<{ module?: string }>).detail
        ?.module;
      if (requestedModule) void openReview(requestedModule);
    };
    window.addEventListener(
      DECLARED_CAPACITY_TRIAL_REVIEW_EVENT,
      onReviewRequest,
    );
    return () =>
      window.removeEventListener(
        DECLARED_CAPACITY_TRIAL_REVIEW_EVENT,
        onReviewRequest,
      );
  }, [enabled, openReview]);

  React.useEffect(() => {
    if (!enabled || openModule || !trials) return;
    const next = trials.trials.find(
      (trial) =>
        trial.status === "EXPIRED" &&
        !trial.decisionRecorded &&
        !isDismissed(trial.module),
    );
    if (next) void openReview(next.module);
  }, [enabled, openModule, openReview, trials]);

  React.useEffect(() => {
    if (openModule) {
      const action = firstActionRef.current;
      if (action && !action.disabled) action.focus();
      else
        dialogRef.current
          ?.querySelector<HTMLElement>(
            'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          )
          ?.focus();
    } else if (restoreFocusRef.current?.isConnected) {
      restoreFocusRef.current.focus();
      restoreFocusRef.current = null;
    }
  }, [openModule, noticeStage, review]);

  const countdownTrials = (trials?.trials ?? [])
    .filter((trial) =>
      shouldShowAddonTrialCountdown(trial.status, trial.expiresAt, now),
    )
    .sort(
      (left, right) =>
        new Date(left.expiresAt ?? "").getTime() -
        new Date(right.expiresAt ?? "").getTime(),
    );

  const close = () => {
    if (openModule) dismissForSession(openModule);
    setOpenModule(null);
    setReview(null);
    setError(null);
    void reload();
  };

  const recordDecision = async (wantsPurchase: boolean) => {
    if (!openModule) return;
    setLoading(true);
    setError(null);
    try {
      await decideDeclaredCapacityAddonTrial(openModule, wantsPurchase);
      if (!wantsPurchase) {
        close();
        return;
      }
      setNoticeStage("price");
      setReview(await fetchDeclaredCapacityAddonPriceReview(openModule));
      await reload();
    } catch {
      setError("Your choice could not be saved. Please retry.");
    } finally {
      setLoading(false);
    }
  };

  const startCheckout = async () => {
    if (!openModule || !interval) return;
    setLoading(true);
    setError(null);
    try {
      const session = await startDeclaredCapacityAddonCheckout(
        openModule,
        interval,
      );
      window.location.assign(session.checkoutUrl);
    } catch {
      setError(
        "Secure checkout could not be started. No paid access has been enabled.",
      );
    } finally {
      setLoading(false);
    }
  };

  const selectedPrice = review
    ? interval === "YEARLY"
      ? review.yearly.amountPence
      : interval === "MONTHLY"
        ? review.monthly.amountPence
        : null
    : null;

  if (!enabled) return null;

  return (
    <>
      {countdownTrials.length > 0 ? (
        <aside
          aria-label="Add-on trial expiry reminders"
          className="border-b border-status-warning/30 bg-status-warning/10 px-4 py-3 text-sm text-text-primary sm:px-6 lg:px-8"
        >
          <div className="mx-auto flex w-full max-w-[100rem] flex-wrap items-center justify-between gap-3">
            <ul className="flex flex-wrap gap-x-5 gap-y-1">
              {countdownTrials.map((trial) => (
                <li key={trial.module}>
                  <span className="font-semibold">
                    {moduleLabel(trial.module)}
                  </span>{" "}
                  trial ·{" "}
                  {trial.expiresAt
                    ? trialTimeRemaining(trial.expiresAt, now)
                    : "soon"}
                </li>
              ))}
            </ul>
            <Link
              href="/billing/institutional"
              className="font-semibold text-accent-strong underline"
            >
              Manage add-ons
            </Link>
          </div>
        </aside>
      ) : null}
      {openModule ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              close();
              return;
            }
            if (event.key !== "Tab") return;

            const focusable = Array.from(
              dialogRef.current?.querySelectorAll<HTMLElement>(
                'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
              ) ?? [],
            );
            if (focusable.length === 0) {
              event.preventDefault();
              dialogRef.current?.focus();
              return;
            }

            const activeElement = document.activeElement;
            const activeIndex =
              activeElement instanceof HTMLElement
                ? focusable.indexOf(activeElement)
                : -1;
            if (event.shiftKey && activeIndex <= 0) {
              event.preventDefault();
              focusable[focusable.length - 1]?.focus();
            } else if (
              !event.shiftKey &&
              (activeIndex === focusable.length - 1 || activeIndex === -1)
            ) {
              event.preventDefault();
              focusable[0]?.focus();
            }
          }}
        >
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="addon-expiry-title"
            aria-describedby="addon-expiry-description"
            className="w-full max-w-lg rounded-2xl border border-border-subtle bg-surface p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-accent-strong">
                  Trial ended
                </p>
                <h2
                  id="addon-expiry-title"
                  className="mt-1 font-heading text-2xl font-bold"
                >
                  {moduleLabel(openModule)}
                </h2>
              </div>
              <button
                type="button"
                aria-label="Dismiss trial message"
                onClick={close}
                className="rounded-md px-2 py-1 text-text-muted hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
              >
                ×
              </button>
            </div>
            {noticeStage === "decision" ? (
              <>
                <p
                  id="addon-expiry-description"
                  className="mt-4 text-sm text-text-muted"
                >
                  Did you like this feature and want to purchase it? It stays
                  off until checkout confirms payment.
                </p>
                {error ? (
                  <p role="alert" className="mt-3 text-sm text-status-danger">
                    {error}
                  </p>
                ) : null}
                <div className="mt-6 flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => void recordDecision(false)}
                    disabled={loading}
                    className="rounded-lg border border-border-subtle px-4 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    No thanks
                  </button>
                  <button
                    ref={firstActionRef}
                    type="button"
                    onClick={() => void recordDecision(true)}
                    disabled={loading}
                    className="rounded-lg bg-accent-primary px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
                  >
                    {loading ? "Saving…" : "Yes, review prices"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p
                  id="addon-expiry-description"
                  className="mt-4 text-sm text-text-muted"
                >
                  Choose how to pay for {moduleLabel(openModule)}. Your
                  selection is billed only after you confirm checkout and Stripe
                  confirms payment.
                </p>
                {review ? (
                  <div
                    role="group"
                    aria-label="Add-on billing interval"
                    className="mt-4 grid gap-3 sm:grid-cols-2"
                  >
                    {(["MONTHLY", "YEARLY"] as const).map((value) => {
                      const amount =
                        value === "MONTHLY"
                          ? review.monthly.amountPence
                          : review.yearly.amountPence;
                      return (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={interval === value}
                          onClick={() => setInterval(value)}
                          className={`rounded-xl border p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary ${interval === value ? "border-accent-strong bg-accent-subtle" : "border-border-subtle"}`}
                        >
                          <span className="block font-semibold">
                            {value === "MONTHLY" ? "Monthly" : "Yearly"}
                          </span>
                          <span className="mt-1 block text-sm text-text-muted">
                            {money(amount)} /{" "}
                            {value === "MONTHLY" ? "month" : "year"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p role="status" className="mt-4 text-sm text-text-muted">
                    Loading approved prices…
                  </p>
                )}
                {error ? (
                  <p role="alert" className="mt-3 text-sm text-status-danger">
                    {error}
                  </p>
                ) : null}
                <div className="mt-6 flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-lg border border-border-subtle px-4 py-2 text-sm font-semibold"
                  >
                    Decide later
                  </button>
                  <button
                    ref={firstActionRef}
                    type="button"
                    onClick={() => void startCheckout()}
                    disabled={loading || selectedPrice === null}
                    className="rounded-lg bg-accent-primary px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
                  >
                    {loading
                      ? "Opening Stripe…"
                      : `Confirm ${interval === "YEARLY" ? "yearly" : "monthly"} purchase and continue`}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
