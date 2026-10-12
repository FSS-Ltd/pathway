"use client";

import React from "react";
import { useRouter } from "next/navigation";
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
import { AdminParentRow, fetchParents } from "../../lib/api-client";
import { useOrgLabel } from "@/lib/use-org-ui";

export default function ParentsPage() {
  const title = useOrgLabel("/parents", "Parents & Guardians");
  const { data: session, status: sessionStatus } = useSession();
  const [data, setData] = React.useState<AdminParentRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [childrenFilter, setChildrenFilter] = React.useState<
    "all" | "with" | "without"
  >("all");
  const router = useRouter();

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchParents();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load parents");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    // Only load data when session is authenticated
    if (sessionStatus === "authenticated" && session) {
      void load();
    }
  }, [sessionStatus, session, load]);

  const filteredData = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return data.filter((row) => {
      const matchesQuery = query
        ? (row.fullName?.toLowerCase() ?? "").includes(query) ||
          (row.email?.toLowerCase() ?? "").includes(query)
        : true;
      const hasChildren =
        typeof row.childrenCount === "number" ? row.childrenCount > 0 : true;
      const matchesChildren =
        childrenFilter === "all"
          ? true
          : childrenFilter === "with"
            ? hasChildren
            : !hasChildren;
      return matchesQuery && matchesChildren;
    });
  }, [data, searchQuery, childrenFilter]);

  const columns = React.useMemo<ColumnDef<AdminParentRow>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        cell: (row) => (
          <div className="flex flex-col">
            <span className="font-semibold text-text-primary">
              {row.fullName}
            </span>
            {row.isPrimaryContact ? (
              <span className="text-xs text-text-muted">Primary contact</span>
            ) : null}
          </div>
        ),
      },
      {
        id: "email",
        header: "Email",
        cell: (row) =>
          row.email ? (
            <a
              href={`mailto:${row.email}`}
              className="text-sm text-accent-strong underline-offset-2 hover:underline"
            >
              {row.email}
            </a>
          ) : (
            <span className="text-sm text-text-muted">-</span>
          ),
      },
      {
        id: "children",
        header: "Children",
        cell: (row) => (
          <span className="text-sm text-text-primary">
            {typeof row.childrenCount === "number"
              ? row.childrenCount === 1
                ? "1 child"
                : `${row.childrenCount} children`
              : "-"}
          </span>
        ),
        align: "right",
        width: "140px",
      },
      {
        id: "status",
        header: "Status",
        cell: (row) => (
          <Badge
            variant={
              row.status === "active"
                ? "success"
                : row.status === "archived"
                  ? "default"
                  : "default"
            }
          >
            {row.status === "active"
              ? "Active"
              : row.status === "archived"
                ? "Archived"
                : "Inactive"}
          </Badge>
        ),
        align: "center",
        width: "120px",
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary font-heading">
            {title}
          </h1>
          <p className="text-sm text-text-muted">
            Contacts with family access for this organisation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={load}>
            Refresh
          </Button>
          <Button variant="outline" size="sm" disabled>
            New parent
          </Button>
        </div>
      </div>

      <Card title={title}>
        {error ? (
          <div className="flex flex-col gap-2 rounded-md border border-status-danger/20 bg-status-danger/5 p-4 text-sm text-status-danger">
            <span className="font-semibold">Couldn’t load parents yet.</span>
            <span className="text-text-muted">{error}</span>
            <div>
              <Button size="sm" variant="secondary" onClick={load}>
                Retry
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search parents or guardians…"
                className="md:max-w-xs"
                aria-label="Search parents or guardians"
              />
              <Select
                value={childrenFilter}
                onChange={(e) =>
                  setChildrenFilter(e.target.value as typeof childrenFilter)
                }
                className="md:w-52"
                aria-label="Filter by children count"
              >
                <option value="all">All</option>
                <option value="with">With children</option>
                <option value="without">Without children</option>
              </Select>
            </div>
            <DataTable
              data={filteredData}
              columns={columns}
              isLoading={isLoading}
              emptyMessage="No parents or guardians found for this organisation yet."
              onRowClick={(row) => router.push(`/parents/${row.id}`)}
            />
          </>
        )}
      </Card>
    </div>
  );
}
