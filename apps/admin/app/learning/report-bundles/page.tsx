"use client";

import Link from "next/link";
import React from "react";
import { useSession } from "@/lib/use-session-compat";
import {
  Badge,
  Button,
  Card,
  DataTable,
  Input,
  Select,
  type ColumnDef,
} from "@pathway/ui";
import {
  type AdminChildRow,
  type AdminReportBundleRow,
  createReportBundle,
  downloadReportBundle,
  fetchChildren,
  fetchReportBundles,
} from "../../../lib/api-client";

const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleDateString();
};
const tone: Record<
  AdminReportBundleRow["status"],
  "default" | "accent" | "success" | "warning"
> = {
  PENDING: "default",
  GENERATING: "accent",
  READY: "success",
  FAILED: "warning",
};

export default function LearningReportBundlesPage() {
  const { data: session, status: sessionStatus } = useSession();
  const [bundles, setBundles] = React.useState<AdminReportBundleRow[]>([]);
  const [children, setChildren] = React.useState<AdminChildRow[]>([]);
  const [childId, setChildId] = React.useState("");
  const [periodStart, setPeriodStart] = React.useState(() =>
    dateKey(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
  );
  const [periodEnd, setPeriodEnd] = React.useState(() => dateKey(new Date()));
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [nextBundles, nextChildren] = await Promise.all([
        fetchReportBundles(),
        fetchChildren(),
      ]);
      setBundles(nextBundles);
      setChildren(nextChildren.filter((child) => child.status === "active"));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Failed to load report bundles",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);
  React.useEffect(() => {
    if (sessionStatus === "authenticated" && session) void load();
  }, [load, session, sessionStatus]);
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (periodEnd < periodStart) {
      setError("The end date must not be before the start date.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const bundle = await createReportBundle({
        childId: childId || undefined,
        periodStart,
        periodEnd,
      });
      setBundles((current) => [bundle, ...current]);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Failed to request report bundle",
      );
    } finally {
      setIsSubmitting(false);
    }
  }
  const columns = React.useMemo<ColumnDef<AdminReportBundleRow>[]>(
    () => [
      {
        id: "period",
        header: "Period",
        cell: (row) =>
          `${formatDate(row.periodStart)} – ${formatDate(row.periodEnd)}`,
      },
      {
        id: "scope",
        header: "Scope",
        cell: (row) => (row.childId ? "One child" : "All children"),
      },
      {
        id: "status",
        header: "Status",
        cell: (row) => (
          <Badge variant={tone[row.status]}>{row.status.toLowerCase()}</Badge>
        ),
        width: "130px",
        align: "center",
      },
      {
        id: "download",
        header: "Download",
        cell: (row) =>
          row.status === "READY" ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                void downloadReportBundle(row.id).catch((caught: unknown) =>
                  setError(
                    caught instanceof Error
                      ? caught.message
                      : "Failed to download report bundle",
                  ),
                )
              }
            >
              CSV
            </Button>
          ) : (
            "-"
          ),
        width: "110px",
        align: "right",
      },
    ],
    [],
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-text-primary">
            Report bundles
          </h1>
          <p className="text-sm text-text-muted">
            Request a CSV report for all children or one child. Generation runs
            in the scheduled worker.
          </p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link href="/learning">Back to Learning</Link>
        </Button>
      </div>
      <Card
        title="Request report bundle"
        description="The report will appear below when the worker has finished."
      >
        <form className="grid gap-3 md:grid-cols-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1 text-sm font-medium text-text-primary">
            Child
            <Select
              value={childId}
              onChange={(event) => setChildId(event.target.value)}
            >
              <option value="">All children</option>
              {children.map((child) => (
                <option key={child.id} value={child.id}>
                  {child.fullName}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-text-primary">
            Start date
            <Input
              required
              type="date"
              value={periodStart}
              onChange={(event) => setPeriodStart(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-text-primary">
            End date
            <Input
              required
              type="date"
              value={periodEnd}
              onChange={(event) => setPeriodEnd(event.target.value)}
            />
          </label>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Requesting…" : "Request report"}
          </Button>
        </form>
      </Card>
      <Card
        title="Requested bundles"
        description="Refresh to see progress from the scheduled worker."
      >
        {error ? (
          <div className="mb-3 rounded-md bg-status-danger/5 p-3 text-sm text-status-danger">
            <span>{error}</span>
            <Button
              className="ml-3"
              size="sm"
              variant="secondary"
              onClick={load}
            >
              Retry
            </Button>
          </div>
        ) : null}
        <DataTable
          data={bundles}
          columns={columns}
          isLoading={isLoading}
          emptyMessage="No report bundles have been requested yet."
        />
      </Card>
    </div>
  );
}
