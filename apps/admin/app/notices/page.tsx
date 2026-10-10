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
import { AdminAnnouncementRow, fetchAnnouncements } from "../../lib/api-client";
import { useAdminContext } from "@/lib/admin-context";
import { hasPermission } from "@/lib/access";
import { StaffNoticeInbox } from "@/components/notices/staff-notice-inbox";

function formatDate(value?: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ManageNoticesPage() {
  const { data: session, status: sessionStatus } = useSession();
  const [data, setData] = React.useState<AdminAnnouncementRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<
    "all" | "draft" | "scheduled" | "sent" | "archived"
  >("all");
  const [audienceFilter, setAudienceFilter] = React.useState<
    "all" | "parents" | "staff"
  >("all");
  const router = useRouter();

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchAnnouncements();
      setData(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load announcements",
      );
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
        ? (row.title?.toLowerCase() ?? "").includes(query)
        : true;
      const statusLabel = row.statusLabel?.toLowerCase() ?? "";
      const audienceLabel = row.audienceLabel?.toLowerCase() ?? "";

      const matchesStatus =
        statusFilter === "all"
          ? true
          : statusLabel.includes(
              statusFilter === "sent" ? "sent" : statusFilter,
            );

      const matchesAudience =
        audienceFilter === "all"
          ? true
          : audienceFilter === "parents"
            ? audienceLabel.includes("parent")
            : audienceLabel.includes("staff");

      return matchesQuery && matchesStatus && matchesAudience;
    });
  }, [data, searchQuery, statusFilter, audienceFilter]);

  const columns = React.useMemo<ColumnDef<AdminAnnouncementRow>[]>(
    () => [
      {
        id: "title",
        header: "Title",
        cell: (row) => (
          <div className="flex flex-col">
            <span className="font-semibold text-text-primary">{row.title}</span>
            <span className="text-xs text-text-muted">
              Audience: {row.audienceLabel}
            </span>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: (row) => <Badge variant="accent">{row.statusLabel}</Badge>,
        align: "center",
        width: "120px",
      },
      {
        id: "created",
        header: "Created",
        cell: (row) => (
          <span className="text-sm text-text-primary">
            {formatDate(row.createdAt)}
          </span>
        ),
        width: "160px",
        align: "right",
      },
      {
        id: "scheduled",
        header: "Scheduled",
        cell: (row) => (
          <span className="text-sm text-text-primary">
            {formatDate(row.scheduledAt)}
          </span>
        ),
        width: "180px",
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
            Notices & Announcements
          </h1>
          <p className="text-sm text-text-muted">
            Messages sent to parents and staff for this organisation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={load}>
            Refresh
          </Button>
          <Button asChild size="sm">
            <a href="/notices/new">New notice</a>
          </Button>
        </div>
      </div>
      <Card title="Notices & Announcements">
        {error ? (
          <div className="flex flex-col gap-2 rounded-md bg-status-danger/5 p-4 text-sm text-status-danger">
            <span className="font-semibold">
              Couldn’t load announcements yet.
            </span>
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
                placeholder="Search notices…"
                className="md:max-w-xs"
                aria-label="Search notices"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as typeof statusFilter)
                  }
                  className="md:w-40"
                  aria-label="Filter by status"
                >
                  <option value="all">All statuses</option>
                  <option value="draft">Draft</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="sent">Sent</option>
                  <option value="archived">Archived</option>
                </Select>
                <Select
                  value={audienceFilter}
                  onChange={(e) =>
                    setAudienceFilter(e.target.value as typeof audienceFilter)
                  }
                  className="md:w-40"
                  aria-label="Filter by audience"
                >
                  <option value="all">All audiences</option>
                  <option value="parents">Parents / guardians</option>
                  <option value="staff">Staff</option>
                </Select>
              </div>
            </div>
            <DataTable
              data={filteredData}
              columns={columns}
              isLoading={isLoading}
              emptyMessage="No announcements have been created for this organisation yet."
              onRowClick={(row) => router.push(`/notices/${row.id}`)}
            />
          </>
        )}
        <p className="mt-3 text-xs text-text-muted">
          {/* Safeguarding note: content not displayed here; this list shows metadata only. */}
          Content is hidden here; open detail to review the full message once
          available.
        </p>
      </Card>
    </div>
  );
}

export default function NoticesPage() {
  const { state } = useAdminContext();
  if (state.status !== "ready") return null;
  const key = `${state.snapshot.activeSiteId}:${state.snapshot.userId}`;
  return hasPermission(state.snapshot.permissions, "notices.manage") ? (
    <ManageNoticesPage key={key} />
  ) : (
    <StaffNoticeInbox key={key} />
  );
}
