"use client";

// Billing page shows plan and usage metadata only.
// Do NOT render card details, billing addresses, or raw provider payloads here.

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/use-session-compat";
import { Badge, Button, Card } from "@pathway/ui";
import {
  AdminBillingOverview,
  AdminBillingPrices,
  fetchBillingOverview,
  fetchBillingPrices,
} from "../../lib/api-client";
import { useAdminAccess } from "../../lib/use-admin-access";
import { canAccessBilling } from "../../lib/access";
import { NoAccessCard } from "../../components/no-access-card";
import {
  getPlanDisplayName,
  getPlanPriceDisplay,
  formatRenewalDate,
  getPlanInfo,
  isRenewalDateInPast,
  getDisplayPeriodEnd,
  mergeCatalogueWithPrices,
  PLAN_CATALOGUE,
} from "../../lib/plan-info";

const statusTone: Record<
  AdminBillingOverview["subscriptionStatus"],
  "default" | "accent" | "success" | "warning"
> = {
  ACTIVE: "success",
  TRIALING: "accent",
  PAST_DUE: "warning",
  CANCELED: "default",
  NONE: "default",
};

const getStatusLabel = (status: AdminBillingOverview["subscriptionStatus"]): string => {
  switch (status) {
    case "ACTIVE":
      return "Active";
    case "TRIALING":
      return "Trial";
    case "PAST_DUE":
      return "Payment issue";
    case "CANCELED":
      return "Canceled";
    case "NONE":
      return "No subscription";
    default:
      return status || "Unknown";
  }
};

// AV30 enforcement thresholds (must match backend)
const AV30_SOFT_CAP_RATIO = 1.0; // 100%
const AV30_GRACE_RATIO = 1.1; // 110%
const AV30_HARD_CAP_RATIO = 1.2; // 120%

const getAv30StatusLabel = (enforcement?: AdminBillingOverview["av30Enforcement"]): string => {
  if (!enforcement) return "Usage not available";
  switch (enforcement.status) {
    case "OK":
      return "Within plan";
    case "SOFT_CAP":
      return "At capacity";
    case "GRACE":
      return "Grace period";
    case "HARD_CAP":
      return "Hard cap reached";
    default:
      return "Unknown status";
  }
};

const getAv30StatusColor = (enforcement?: AdminBillingOverview["av30Enforcement"]): string => {
  if (!enforcement) return "bg-muted";
  switch (enforcement.status) {
    case "OK":
      return "bg-status-success";
    case "SOFT_CAP":
      return "bg-status-warning";
    case "GRACE":
      return "bg-status-warning";
    case "HARD_CAP":
      return "bg-status-danger";
    default:
      return "bg-muted";
  }
};

const ratioPercent = (current?: number | null, cap?: number | null) => {
  if (!cap || cap <= 0 || current === null || current === undefined) return 0;
  return Math.min((current / cap) * 100, 120);
};

export default function BillingPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const { role, isLoading: isLoadingAccess } = useAdminAccess();
  const [data, setData] = React.useState<AdminBillingOverview | null>(null);
  const [prices, setPrices] = React.useState<AdminBillingPrices | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [overviewResult, pricesResult] = await Promise.all([
        fetchBillingOverview(),
        fetchBillingPrices(),
      ]);
      setData(overviewResult);
      setPrices(pricesResult ?? null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load billing overview",
      );
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (sessionStatus !== "authenticated" || !session) return;
    void load();
  }, [sessionStatus, session, load]);

  const mergedByCode = React.useMemo(() => {
    const merged = mergeCatalogueWithPrices(
      PLAN_CATALOGUE,
      prices?.prices ?? [],
    );
    return Object.fromEntries(merged.map((p) => [p.code, p]));
  }, [prices]);

  const planInfo = data
    ? (mergedByCode[data.planCode ?? ""] ?? getPlanInfo(data.planCode))
    : null;
  const planDisplayName = planInfo?.displayName ?? getPlanDisplayName(data?.planCode);
  const priceDisplay = planInfo?.priceDisplay ?? getPlanPriceDisplay(data?.planCode);

  // Access control guard
  if (isLoadingAccess) {
    return (
      <div className="flex flex-col gap-4">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-4 w-96 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (!canAccessBilling(role)) {
    return (
      <NoAccessCard
        title="You don't have access to billing"
        message="Billing and subscription management is only available to organisation admins."
      />
    );
  }

  const loadingBlock = (
    <div className="space-y-2">
      <span className="block h-3 w-32 animate-pulse rounded bg-muted" />
      <span className="block h-3 w-24 animate-pulse rounded bg-muted" />
      <span className="block h-3 w-20 animate-pulse rounded bg-muted" />
    </div>
  );

  const isMasterOrg = data?.isMasterOrg === true;

  const planCard = (
    <Card title="Current Plan">
      {isLoading ? (
        loadingBlock
      ) : error ? (
        <div className="rounded-md border border-status-danger/20 bg-status-danger/5 p-4 text-sm text-status-danger">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">Couldn't load billing info.</span>
            <Button size="sm" variant="secondary" onClick={load}>
              Retry
            </Button>
          </div>
          <p className="text-xs text-text-muted">{error}</p>
        </div>
      ) : isMasterOrg ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-sm">
              Internal / Master Organisation
            </Badge>
          </div>
          <p className="text-sm text-text-muted">
            This organisation has unlimited access. No subscription or billing applies.
          </p>
        </div>
      ) : data ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant="accent" className="text-sm">
              Current plan
            </Badge>
          </div>
          <div>
            <h3 className="text-2xl font-semibold text-text-primary">
              {planDisplayName}
            </h3>
            <p className="mt-1 text-lg text-text-muted">{priceDisplay}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={statusTone[data.subscriptionStatus] ?? "default"}>
              {getStatusLabel(data.subscriptionStatus)}
            </Badge>
          </div>
          {data.subscriptionStatus === "ACTIVE" && !data.cancelAtPeriodEnd && (() => {
            const displayEnd = getDisplayPeriodEnd(data.periodStart, data.periodEnd);
            const isEstimated = isRenewalDateInPast(data.periodEnd);
            return (
              <p className="text-sm text-text-muted">
                Renews on <strong>{displayEnd ? formatRenewalDate(displayEnd.toISOString()) : "—"}</strong>
                {isEstimated && (
                  <span className="block mt-0.5 text-xs text-text-muted">
                    Subject to change (e.g. bank holidays).
                  </span>
                )}
              </p>
            );
          })()}
          {data.cancelAtPeriodEnd && (
            <div className="rounded-md border border-warning/20 bg-warning/5 p-3">
              <p className="text-sm font-semibold text-warning-strong">
                Plan canceled
              </p>
              <p className="mt-1 text-xs text-text-muted">
                Your subscription will end on {formatRenewalDate(data.periodEnd)}.
                Contact support to reactivate.
              </p>
            </div>
          )}
          {data.subscriptionStatus === "PAST_DUE" && (
            <div className="rounded-md border border-warning/20 bg-warning/5 p-3">
              <p className="text-sm font-semibold text-warning-strong">
                Payment issue detected
              </p>
              <p className="mt-1 text-xs text-text-muted">
                We'll keep your access active during a temporary grace period.
                Please update your payment method.
              </p>
            </div>
          )}
          {planInfo && (
            <p className="text-sm text-text-muted">
              Includes up to {planInfo.av30Included ?? "unlimited"} active staff/volunteers (AV30)
            </p>
          )}
        </div>
      ) : !isMasterOrg ? (
        <div className="space-y-3">
          <p className="text-sm text-text-muted">
            No active subscription found for this organisation.
          </p>
          <Button size="sm" onClick={() => router.push("/billing/configure")}>
            Get started with a plan
          </Button>
        </div>
      ) : null}
    </Card>
  );

  const av30Card = (
    <Card title="AV30 Usage">
      {isLoading ? (
        loadingBlock
      ) : error ? (
        <p className="text-sm text-status-danger">Unable to load AV30 usage.</p>
      ) : isMasterOrg ? (
        <p className="text-sm text-text-muted">Unlimited — no limits apply to this organisation.</p>
      ) : data ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-muted">Current</span>
            <span className="font-semibold text-text-primary">
              {data.currentAv30 ?? "-"}
              {data.av30Cap ? ` / ${data.av30Cap}` : ""}
            </span>
          </div>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
            {/* Threshold markers */}
            {data.av30Cap && (
              <>
                <div
                  className="absolute top-0 h-full w-px bg-text-muted/30"
                  style={{ left: `${AV30_SOFT_CAP_RATIO * 100}%` }}
                  title="100% - Soft cap"
                />
                <div
                  className="absolute top-0 h-full w-px bg-status-warning/50"
                  style={{ left: `${AV30_GRACE_RATIO * 100}%` }}
                  title="110% - Grace period starts"
                />
                <div
                  className="absolute top-0 h-full w-px bg-status-danger/70"
                  style={{ left: `${AV30_HARD_CAP_RATIO * 100}%` }}
                  title="120% - Hard cap"
                />
              </>
            )}
            <div
              className={`h-full rounded-full transition-colors ${getAv30StatusColor(data.av30Enforcement)}`}
              style={{ width: `${ratioPercent(data.currentAv30, data.av30Cap)}%` }}
            />
          </div>
          <p className="text-xs text-text-muted">
            {getAv30StatusLabel(data.av30Enforcement)}
          </p>
          {data.av30Enforcement?.status === "GRACE" && data.av30Enforcement.graceUntil && (
            <div className="rounded-md border border-status-warning/20 bg-status-warning/10 px-3 py-2">
              <p className="text-xs font-semibold text-status-warning">Grace period active</p>
              <p className="text-xs text-text-muted">
                Upgrade by {new Date(data.av30Enforcement.graceUntil).toLocaleDateString("en-GB")} to avoid restrictions
              </p>
            </div>
          )}
          {data.av30Enforcement?.status === "HARD_CAP" && (
            <div className="rounded-md border border-status-danger/20 bg-status-danger/10 px-3 py-2">
              <p className="text-xs font-semibold text-status-danger">Hard cap reached</p>
              <p className="text-xs text-text-muted">
                Publishing new rotas/announcements is blocked. Upgrade to continue.
              </p>
            </div>
          )}
          <div className="flex items-center gap-3 text-xs text-text-muted">
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-status-success" />
              <span>0-100%</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-status-warning" />
              <span>100-120%</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-2 w-2 rounded-full bg-status-danger" />
              <span>120%+</span>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-text-muted">No AV30 data available.</p>
      )}
    </Card>
  );

  const limitsCard = (
    <Card title="Usage Limits">
      {isLoading ? (
        loadingBlock
      ) : error ? (
        <p className="text-sm text-status-danger">
          Unable to load usage limits.
        </p>
      ) : isMasterOrg ? (
        <p className="text-sm text-text-muted">Unlimited — no limits apply to this organisation.</p>
      ) : data ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-md border border-border-subtle bg-surface px-3 py-2">
            <p className="text-xs text-text-muted">Storage</p>
            <p className="text-sm font-semibold text-text-primary">
              {data.storageGbUsage ?? "-"} / {data.storageGbCap ?? "-"} GB
            </p>
          </div>
          <div className="rounded-md border border-border-subtle bg-surface px-3 py-2">
            <p className="text-xs text-text-muted">SMS (month)</p>
            <p className="text-sm font-semibold text-text-primary">
              {data.smsMonthUsage ?? "-"} / {data.smsMessagesCap ?? "-"}
            </p>
          </div>
          <div className="rounded-md border border-border-subtle bg-surface px-3 py-2">
            <p className="text-xs text-text-muted">Leader seats included</p>
            <p className="text-sm font-semibold text-text-primary">
              {data.leaderSeatsIncluded ?? "-"}
            </p>
          </div>
          <div className="rounded-md border border-border-subtle bg-surface px-3 py-2">
            <p className="text-xs text-text-muted">Max sites</p>
            <p className="text-sm font-semibold text-text-primary">
              {data.maxSites ?? "-"}
            </p>
          </div>
          <p className="col-span-full text-xs text-text-muted">
            Some limits may be unset; contact support if these look incomplete.
          </p>
        </div>
      ) : (
        <p className="text-sm text-text-muted">No limits available.</p>
      )}
    </Card>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary font-heading">
            Billing & Usage
          </h1>
          <p className="text-sm text-text-muted">
            Manage your Nexsteps plan and usage for this organisation.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={load}>
          Refresh
        </Button>
      </div>
      {/* UI intentionally avoids showing any payment method PII; this is a usage/plan summary only. */}
      <div className="grid gap-4 md:grid-cols-2">
        {planCard}
        {av30Card}
      </div>
      {limitsCard}
      {!isMasterOrg && (
        <Card title="Change your plan">
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text-muted">
              {data?.planCode
                ? "Upgrade to a higher tier or adjust your plan settings."
                : "Choose a plan that fits your school or organisation."}
            </p>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => router.push("/billing/configure")}>
                  {data?.planCode ? "Upgrade plan" : "Choose a plan"}
                </Button>
                <p className="text-xs text-text-muted">
                  Plan changes are handled securely via Stripe. You'll review pricing before confirming.
                </p>
              </div>
              {data?.planCode && (
                <p className="text-xs text-text-muted">
                  Current plan: {planDisplayName} • {priceDisplay}
                </p>
              )}
            </div>
          </div>
        </Card>
      )}
      <div className="text-sm text-text-muted">
        <Link
          href="/reports"
          className="text-xs font-semibold text-accent-strong underline-offset-2 hover:underline"
        >
          View detailed reports
        </Link>
      </div>
    </div>
  );
}
