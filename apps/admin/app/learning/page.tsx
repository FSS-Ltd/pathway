"use client";

import Link from "next/link";
import React from "react";
import { useSession } from "@/lib/use-session-compat";
import { Badge, Button, Card, DataTable, type ColumnDef } from "@pathway/ui";
import {
  type AdminLearningLogRow,
  type AdminLearningSubject,
  type AdminReportBundleRow,
  fetchLearningLogs,
  fetchLearningSubjects,
  fetchReportBundles,
} from "../../lib/api-client";

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString();
}

const bundleTone: Record<
  AdminReportBundleRow["status"],
  "default" | "accent" | "success" | "warning"
> = {
  PENDING: "default",
  GENERATING: "accent",
  READY: "success",
  FAILED: "warning",
};

export default function LearningPage() {
  const { data: session, status: sessionStatus } = useSession();
  const [logs, setLogs] = React.useState<AdminLearningLogRow[]>([]);
  const [subjects, setSubjects] = React.useState<AdminLearningSubject[]>([]);
  const [bundles, setBundles] = React.useState<AdminReportBundleRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [nextLogs, nextSubjects, nextBundles] = await Promise.all([
        fetchLearningLogs(),
        fetchLearningSubjects(),
        fetchReportBundles(),
      ]);
      setLogs(nextLogs);
      setSubjects(nextSubjects);
      setBundles(nextBundles);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Failed to load Learning",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (sessionStatus === "authenticated" && session) {
      void load();
    }
  }, [load, session, sessionStatus]);

  const logColumns = React.useMemo<ColumnDef<AdminLearningLogRow>[]>(
    () => [
      {
        id: "title",
        header: "Activity",
        cell: (row) => (
          <span className="font-semibold text-text-primary">{row.title}</span>
        ),
      },
      {
        id: "date",
        header: "Date",
        cell: (row) => formatDate(row.activityDate),
        width: "140px",
      },
      {
        id: "minutes",
        header: "Minutes",
        cell: (row) => row.minutes ?? "-",
        width: "100px",
        align: "right",
      },
    ],
    [],
  );

  const bundleColumns = React.useMemo<ColumnDef<AdminReportBundleRow>[]>(
    () => [
      {
        id: "period",
        header: "Period",
        cell: (row) =>
          `${formatDate(row.periodStart)} – ${formatDate(row.periodEnd)}`,
      },
      {
        id: "status",
        header: "Status",
        cell: (row) => (
          <Badge variant={bundleTone[row.status]}>
            {row.status.toLowerCase()}
          </Badge>
        ),
        width: "130px",
        align: "center",
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-text-primary">
            Learning
          </h1>
          <p className="text-sm text-text-muted">
            Record learning activity, maintain subjects, and prepare CSV report
            bundles.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={load}>
            Refresh
          </Button>
          <Button asChild size="sm">
            <Link href="/learning/logs/new">Log learning</Link>
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-status-danger/20 bg-status-danger/5 p-4 text-sm text-status-danger">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">Couldn’t load Learning.</span>
            <Button size="sm" variant="secondary" onClick={load}>
              Retry
            </Button>
          </div>
          <p className="text-xs text-text-muted">{error}</p>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card
          title="Learning logs"
          description={`${logs.length} recorded ${logs.length === 1 ? "activity" : "activities"}.`}
        >
          <Link
            className="text-sm font-medium text-status-info hover:underline"
            href="/learning/logs/new"
          >
            Record an activity
          </Link>
        </Card>
        <Card
          title="Subjects"
          description={`${subjects.length} subject${subjects.length === 1 ? "" : "s"} available.`}
        >
          <Link
            className="text-sm font-medium text-status-info hover:underline"
            href="/learning/subjects"
          >
            Manage subjects
          </Link>
        </Card>
        <Card
          title="Report bundles"
          description={`${bundles.length} requested bundle${bundles.length === 1 ? "" : "s"}.`}
        >
          <Link
            className="text-sm font-medium text-status-info hover:underline"
            href="/learning/report-bundles"
          >
            Request a report
          </Link>
        </Card>
      </div>

      <Card
        title="Recent learning"
        description="Latest learning activity recorded for this organisation."
      >
        <DataTable
          data={logs.slice(0, 10)}
          columns={logColumns}
          isLoading={isLoading}
          emptyMessage="No learning activity has been recorded yet."
        />
      </Card>
      <Card
        title="Recent report bundles"
        description="CSV bundles are generated by the scheduled worker."
      >
        <DataTable
          data={bundles.slice(0, 10)}
          columns={bundleColumns}
          isLoading={isLoading}
          emptyMessage="No report bundles have been requested yet."
        />
      </Card>
    </div>
  );
}
