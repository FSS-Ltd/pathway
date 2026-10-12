"use client";

// Reports guardrails:
// - High-level metadata snapshot only.
// - Do NOT surface safeguarding note text, DSAR exports, raw logs, or secrets.
// - Use counts, statuses, and plan/usage summaries only.

import React from "react";
import Link from "next/link";
import { Badge, Button, Card } from "@pathway/ui";
import { fetchAdminKpis, type AdminKpis } from "../../lib/api-client";
import { useAdminAccess } from "../../lib/use-admin-access";
import { canAccessAdminSection } from "../../lib/access";
import { NoAccessCard } from "../../components/no-access-card";

const numberOrDash = (value?: number | null) =>
  typeof value === "number" ? value : "-";

export default function ReportsPage() {
  const { role, isLoading: isLoadingAccess } = useAdminAccess();
  const [kpis, setKpis] = React.useState<AdminKpis | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // All hooks must be called before any conditional returns
  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchAdminKpis();
      setKpis(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load reports data",
      );
      setKpis(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    // Only load data when user has access
    if (!isLoadingAccess && canAccessAdminSection(role)) {
      void load();
    }
  }, [isLoadingAccess, role, load]);

  // Access control guard - after all hooks
  if (isLoadingAccess) {
    return (
      <div className="flex flex-col gap-4">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-4 w-96 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (!canAccessAdminSection(role)) {
    return (
      <NoAccessCard
        title="You don't have access to reports"
        message="Reports and insights are only available to administrators."
      />
    );
  }

  const loadingBlock = (
    <div className="space-y-2">
      <span className="block h-4 w-16 animate-pulse rounded bg-muted" />
      <span className="block h-3 w-20 animate-pulse rounded bg-muted" />
    </div>
  );

  const renderKpiCard = (
    title: string,
    value: number | string,
    linkHref: string,
    linkLabel: string,
    badge?: React.ReactNode,
  ) => (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-muted">{title}</p>
        {badge}
      </div>
      <p className="mt-2 text-3xl font-semibold text-text-primary">{value}</p>
      <Link
        href={linkHref}
        className="mt-2 inline-block text-xs font-semibold text-accent-strong underline-offset-2 hover:underline"
      >
        {linkLabel}
      </Link>
    </Card>
  );

  if (!isLoading && error && !kpis) {
    return (
      <Card title="Reports & Insights">
        <div className="space-y-3">
          <p className="text-sm text-text-muted">
            We couldn’t load reports right now.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={load}>
              Retry
            </Button>
          </div>
          <p className="text-xs text-text-muted">{error}</p>
        </div>
      </Card>
    );
  }

  const childrenCount = numberOrDash(kpis?.totalChildren);
  const parentsCount = numberOrDash(kpis?.totalParents);
  const concernsCount = numberOrDash(kpis?.openConcerns);
  const av30Label =
    kpis?.av30Used !== undefined && kpis?.av30Cap !== undefined
      ? `${kpis.av30Used ?? "-"} / ${kpis.av30Cap ?? "-"}`
      : "AV30 not available yet";

  const concernsBadge =
    typeof kpis?.openConcerns === "number" && kpis.openConcerns > 0 ? (
      <Badge variant="warning">Attention</Badge>
    ) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary font-heading">
            Reports & Insights
          </h1>
          <p className="text-sm text-text-muted">
            High-level activity, safeguarding, and usage snapshots for this organisation.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={load}>
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, idx) => (
              <Card key={idx}>{loadingBlock}</Card>
            ))
          : (
            <>
              {renderKpiCard(
                "Children enrolled",
                childrenCount,
                "/children",
                "View children",
              )}
              {renderKpiCard(
                "Parents & guardians",
                parentsCount,
                "/parents",
                "View parents",
              )}
              {renderKpiCard(
                "Open concerns",
                concernsCount,
                "/safeguarding",
                "View safeguarding",
                concernsBadge,
              )}
              {renderKpiCard("AV30 usage", av30Label, "/billing", "View billing")}
            </>
          )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Activity & Attendance">
          {isLoading ? (
            loadingBlock
          ) : (
            <div className="space-y-2 text-sm text-text-primary">
              <p>
                {typeof kpis?.sessionsToday === "number"
                  ? `${kpis.sessionsToday} sessions scheduled today.`
                  : "Session activity not available yet."}
              </p>
              <div className="flex items-center gap-2">
                <Link
                  href="/sessions"
                  className="text-xs font-semibold text-accent-strong underline-offset-2 hover:underline"
                >
                  Open sessions view
                </Link>
                <Link
                  href="/attendance"
                  className="text-xs font-semibold text-accent-strong underline-offset-2 hover:underline"
                >
                  Open attendance overview
                </Link>
              </div>
            </div>
          )}
        </Card>

        <Card title="Safeguarding & Wellbeing Snapshot">
          {isLoading ? (
            loadingBlock
          ) : (
            <div className="space-y-2 text-sm text-text-primary">
              <p>
                Open concerns:{" "}
                {typeof kpis?.openConcerns === "number"
                  ? kpis.openConcerns
                  : "-"}
              </p>
              <p>
                Positive notes recorded:{" "}
                {typeof kpis?.positiveNotesCount === "number"
                  ? kpis.positiveNotesCount
                  : "-"}
              </p>
              <Link
                href="/safeguarding"
                className="text-xs font-semibold text-accent-strong underline-offset-2 hover:underline"
              >
                Open safeguarding
              </Link>
              <p className="text-xs text-text-muted">
                {/* REPORTS: safeguarding area here must remain metadata-only (no note/concern text or DSAR-like detail). */}
                Metadata only - safeguarding details live in Safeguarding.
              </p>
            </div>
          )}
        </Card>

        <Card title="Billing & Usage Snapshot" className="md:col-span-2">
          {isLoading ? (
            loadingBlock
          ) : (
            <div className="space-y-2 text-sm text-text-primary">
              <p>
                Plan tier: {kpis?.planTier ?? "Not available yet."}
              </p>
              <p>
                AV30 usage: {av30Label}
              </p>
              <Link
                href="/billing"
                className="text-xs font-semibold text-accent-strong underline-offset-2 hover:underline"
              >
                Open billing & usage
              </Link>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
