"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/use-session-compat";
import { Badge, Button, Card, DataTable, type ColumnDef } from "@pathway/ui";
import {
  fetchActiveSiteState,
  fetchClasses,
  type ClassRow,
} from "../../lib/api-client";
import { useOrgLabel } from "@/lib/use-org-ui";

const resolveTenantId = (
  activeSiteId: string | null,
  sites: Array<{ id: string }>,
) => {
  const activeSite = sites.find((s) => s.id === activeSiteId) ?? sites[0];
  return activeSite?.id ?? null;
};

function formatAgeRange(min: number | null, max: number | null): string {
  if (min == null && max == null) return "—";
  if (min != null && max != null) return `${min}–${max}`;
  if (min != null) return `${min}+`;
  return `≤${max}`;
}

export default function ClassesPage() {
  const title = useOrgLabel("/classes", "Classes");
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [data, setData] = React.useState<ClassRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [tenantId, setTenantId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchClasses();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load classes");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (sessionStatus !== "authenticated" || !session) return;
    const loadSite = async () => {
      try {
        const state = await fetchActiveSiteState();
        const id = resolveTenantId(state.activeSiteId, state.sites);
        setTenantId(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load active site");
      }
    };
    void loadSite();
  }, [sessionStatus, session]);

  React.useEffect(() => {
    if (tenantId) void load();
  }, [tenantId, load]);

  const sortedData = React.useMemo(() => {
    return [...data].sort((a, b) => {
      const aMin = a.minAge ?? 999;
      const aMax = a.maxAge ?? 999;
      const bMin = b.minAge ?? 999;
      const bMax = b.maxAge ?? 999;
      if (aMin !== bMin) return aMin - bMin;
      if (aMax !== bMax) return aMax - bMax;
      return a.name.localeCompare(b.name);
    });
  }, [data]);

  const columns = React.useMemo<ColumnDef<ClassRow>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        cell: (row) => (
          <div className="flex flex-col">
            <span className="font-semibold text-text-primary">{row.name}</span>
            {row.description ? (
              <span className="text-xs text-text-muted line-clamp-1">
                {row.description}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        id: "ageRange",
        header: "Age range",
        cell: (row) => (
          <span className="text-sm text-text-primary">
            {formatAgeRange(row.minAge, row.maxAge)}
          </span>
        ),
        width: "100px",
      },
      {
        id: "status",
        header: "Status",
        cell: (row) => (
          <Badge
            variant={row.isActive ? "success" : "default"}
            className="capitalize"
          >
            {row.isActive ? "Active" : "Inactive"}
          </Badge>
        ),
        width: "100px",
      },
      {
        id: "sessions",
        header: "Sessions",
        cell: (row) => (
          <span className="text-sm text-text-muted">
            {row.sessionsCount ?? 0}
          </span>
        ),
        width: "90px",
        align: "right",
      },
      {
        id: "actions",
        header: "",
        cell: (row) => (
          <Button
            variant="secondary"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/classes/${row.id}/edit`);
            }}
          >
            Edit
          </Button>
        ),
        width: "80px",
      },
    ],
    [router],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-text-primary">
            {title}
          </h1>
          <p className="text-sm text-text-muted">
            Age groups and classes used for sessions and attendance.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={load}>
            Refresh
          </Button>
          <Button asChild size="sm">
            <Link href="/classes/new">New class</Link>
          </Button>
        </div>
      </div>

      <Card
        title="Classes"
        description="Create and manage classes (age groups) for this site."
      >
        {error ? (
          <div className="rounded-md border border-status-danger/20 bg-status-danger/5 p-4 text-sm text-status-danger">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">Couldn&apos;t load classes.</span>
              <Button size="sm" variant="secondary" onClick={load}>
                Retry
              </Button>
            </div>
            <p className="text-xs text-text-muted">{error}</p>
          </div>
        ) : (
          <DataTable
            data={sortedData}
            columns={columns}
            isLoading={isLoading}
            emptyMessage="No classes yet. Create one to get started."
            onRowClick={(row) => router.push(`/classes/${row.id}/edit`)}
          />
        )}
      </Card>
    </div>
  );
}
