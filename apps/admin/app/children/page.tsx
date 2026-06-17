"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Badge,
  Button,
  Card,
  DataTable,
  Input,
  Select,
  type ColumnDef,
} from "@pathway/ui";
import { AdminChildRow, fetchChildren } from "../../lib/api-client";

export default function ChildrenPage() {
  const { data: session, status: sessionStatus } = useSession();
  const [data, setData] = React.useState<AdminChildRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [ageFilter, setAgeFilter] = React.useState<string>("all");
  const router = useRouter();

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchChildren();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load children");
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

  const ageGroups = React.useMemo(() => {
    const groups = new Set<string>();
    data.forEach((child) => {
      if (child.ageGroup) groups.add(child.ageGroup);
    });
    return Array.from(groups).sort();
  }, [data]);

  const filteredData = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return data.filter((row) => {
      const nameMatch = query
        ? (row.fullName?.toLowerCase() ?? "").includes(query) ||
          (row.preferredName?.toLowerCase() ?? "").includes(query)
        : true;
      const ageMatch = ageFilter === "all" ? true : row.ageGroup === ageFilter;
      return nameMatch && ageMatch;
    });
  }, [data, searchQuery, ageFilter]);

  const columns = React.useMemo<ColumnDef<AdminChildRow>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        cell: (row) => (
          <div className="flex flex-col">
            <span className="font-semibold text-text-primary">
              {row.fullName}
            </span>
            {row.preferredName ? (
              <span className="text-sm text-text-muted">
                Preferred: {row.preferredName}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        id: "ageGroup",
        header: "Age group",
        cell: (row) => (
          <span className="text-sm text-text-primary">
            {row.ageGroup ?? "-"}
          </span>
        ),
        width: "120px",
      },
      {
        id: "primaryGroup",
        header: "Primary group/class",
        cell: (row) => (
          <span className="text-sm text-text-primary">
            {row.primaryGroup ?? "-"}
          </span>
        ),
        width: "160px",
      },
      {
        id: "flags",
        header: "Flags",
        cell: (row) => (
          <div className="flex flex-wrap gap-2">
            {row.hasAllergies ? (
              <Badge variant="warning">Allergies</Badge>
            ) : null}
            {row.hasAdditionalNeeds ? (
              <Badge variant="accent">Additional needs</Badge>
            ) : null}
            <Badge variant={row.hasPhotoConsent ? "success" : "default"}>
              {row.hasPhotoConsent ? "Org photo/video consent" : "No org photo/video consent"}
            </Badge>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: (row) => (
          <Badge variant={row.status === "active" ? "success" : "default"}>
            {row.status === "active" ? "Active" : "Inactive"}
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
            Children
          </h1>
          <p className="text-sm text-text-muted">
            Child records for this organisation, including needs awareness and organisation photo/video consent.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={load}>
            Refresh
          </Button>
          <Button size="sm">Add child</Button>
        </div>
      </div>
      <Card
        title="Children Roster"
        description="Mock data for now. Will respect tenant scoping and organisation consent rules."
      >
        {error ? (
          <div className="flex flex-col gap-2 rounded-md bg-status-danger/5 p-4 text-sm text-status-danger">
            <span className="font-semibold">Unable to load children</span>
            <span>{error}</span>
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
                placeholder="Search children…"
                className="md:max-w-xs"
                aria-label="Search children"
              />
              <Select
                value={ageFilter}
                onChange={(e) => setAgeFilter(e.target.value)}
                className="md:w-48"
                aria-label="Filter by age group"
              >
                <option value="all">All age groups</option>
                {ageGroups.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </Select>
            </div>
            <DataTable
              data={filteredData}
              columns={columns}
              isLoading={isLoading}
              emptyMessage="No children are registered for this organisation yet."
              onRowClick={(row) => router.push(`/children/${row.id}`)}
            />
          </>
        )}
      </Card>
    </div>
  );
}
