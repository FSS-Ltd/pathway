"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/use-session-compat";
import { Badge, Button, Card, DataTable, type ColumnDef } from "@pathway/ui";
import { AdminLessonRow, fetchLessons } from "../../lib/api-client";
import { useOrgLabel } from "@/lib/use-org-ui";

const statusTone: Record<
  AdminLessonRow["status"],
  "default" | "accent" | "success"
> = {
  draft: "default",
  published: "success",
  archived: "default",
  unknown: "default",
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString();
}

export default function LessonsPage() {
  const title = useOrgLabel("/lessons", "Lessons");
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [data, setData] = React.useState<AdminLessonRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchLessons();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lessons");
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

  const columns = React.useMemo<ColumnDef<AdminLessonRow>[]>(
    () => [
      {
        id: "title",
        header: "Title",
        cell: (row) => (
          <div className="flex flex-col">
            <span className="font-semibold text-text-primary">{row.title}</span>
            <span className="text-xs text-text-muted">
              {row.ageGroupLabel ?? "Age group TBC"} ·{" "}
              {row.groupLabel ?? "Group TBC"}
            </span>
          </div>
        ),
      },
      {
        id: "ageGroup",
        header: "Age group",
        cell: (row) => (
          <span className="text-sm text-text-primary">
            {row.ageGroupLabel ?? "-"}
          </span>
        ),
        width: "140px",
      },
      {
        id: "group",
        header: "Group/Class",
        cell: (row) => (
          <span className="text-sm text-text-primary">
            {row.groupLabel ?? "-"}
          </span>
        ),
        width: "140px",
      },
      {
        id: "status",
        header: "Status",
        cell: (row) => (
          <Badge variant={statusTone[row.status]} className="capitalize">
            {row.status}
          </Badge>
        ),
        width: "120px",
        align: "center",
      },
      {
        id: "updated",
        header: "Updated",
        cell: (row) => (
          <span className="text-sm text-text-primary">
            {formatDate(row.updatedAt)}
          </span>
        ),
        width: "140px",
        align: "right",
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
            Curriculum content organised by age group and class.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={load}>
            Refresh
          </Button>
          <Button asChild size="sm">
            <a href="/lessons/new">New lesson</a>
          </Button>
        </div>
      </div>

      <Card
        title="Lessons"
        description="Manage and review lesson content for this organisation."
      >
        {error ? (
          <div className="rounded-md border border-status-danger/20 bg-status-danger/5 p-4 text-sm text-status-danger">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">Couldn’t load lessons.</span>
              <Button size="sm" variant="secondary" onClick={load}>
                Retry
              </Button>
            </div>
            <p className="text-xs text-text-muted">{error}</p>
          </div>
        ) : (
          <DataTable
            data={data}
            columns={columns}
            isLoading={isLoading}
            emptyMessage="No lessons have been created for this organisation yet."
            onRowClick={(row) => router.push(`/lessons/${row.id}`)}
          />
        )}
      </Card>
    </div>
  );
}

