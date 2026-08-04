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
import {
  fetchAdminHandoverLogs,
  fetchGroups,
  type AdminHandoverListItem,
  type GroupOption,
  type HandoverLogStatus,
} from "../../../lib/api-client";

const statusLabel: Record<HandoverLogStatus, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending approval",
  APPROVED: "Approved",
};

const statusTone: Record<
  HandoverLogStatus,
  "default" | "warning" | "success"
> = {
  DRAFT: "default",
  PENDING_APPROVAL: "warning",
  APPROVED: "success",
};

export default function AdminHandoverPage() {
  const router = useRouter();
  const { status: sessionStatus } = useSession();

  const [logs, setLogs] = React.useState<AdminHandoverListItem[]>([]);
  const [groups, setGroups] = React.useState<GroupOption[]>([]);
  const [dateFilter, setDateFilter] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<
    "all" | HandoverLogStatus
  >("all");
  const [groupFilter, setGroupFilter] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const groupNameMap = React.useMemo(
    () => new Map(groups.map((g) => [g.id, g.name])),
    [groups],
  );

  const loadLogs = React.useCallback(async () => {
    if (sessionStatus !== "authenticated") return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAdminHandoverLogs({
        date: dateFilter || undefined,
        groupId: groupFilter || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
      });
      setLogs(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load handover logs. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [sessionStatus, dateFilter, groupFilter, statusFilter]);

  React.useEffect(() => {
    if (sessionStatus !== "authenticated") return;

    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [groupsResult, logsResult] = await Promise.all([
          fetchGroups({ activeOnly: true }),
          fetchAdminHandoverLogs({}),
        ]);
        if (cancelled) return;
        setGroups(groupsResult);
        setLogs(logsResult);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load handover logs. Please try again.",
        );
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [sessionStatus]);

  const columns = React.useMemo<ColumnDef<AdminHandoverListItem>[]>(
    () => [
      {
        id: "date",
        header: "Date",
        cell: (row) => {
          const d = new Date(row.handoverDate);
          const label = Number.isNaN(d.getTime())
            ? row.handoverDate
            : d.toLocaleDateString(undefined, {
                weekday: "short",
                year: "numeric",
                month: "short",
                day: "numeric",
              });
          return (
            <div className="flex flex-col">
              <span className="font-medium text-text-primary">{label}</span>
            </div>
          );
        },
      },
      {
        id: "group",
        header: "Group / Class",
        cell: (row) => {
          const name = groupNameMap.get(row.groupId) ?? "Unknown group";
          return (
            <div className="flex flex-col">
              <span className="font-medium text-text-primary">{name}</span>
            </div>
          );
        },
      },
      {
        id: "status",
        header: "Status",
        cell: (row) => (
          <Badge variant={statusTone[row.status]}>{statusLabel[row.status]}</Badge>
        ),
        align: "center",
        width: "140px",
      },
      {
        id: "approvedAt",
        header: "Approved at",
        cell: (row) => {
          if (!row.approvedAt) return <span className="text-sm text-text-muted">—</span>;
          const d = new Date(row.approvedAt);
          const label = Number.isNaN(d.getTime())
            ? row.approvedAt
            : d.toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });
          return (
            <span className="text-sm text-text-muted">
              {label}
            </span>
          );
        },
        width: "180px",
      },
      {
        id: "actions",
        header: "Actions",
        cell: (row) => (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/admin/handover/${row.id}`);
            }}
          >
            View
          </Button>
        ),
        align: "right",
        width: "120px",
      },
    ],
    [groupNameMap, router],
  );

  const hasAccessError =
    error?.includes("don’t have permission") || error?.includes("403");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary font-heading">
            Handover logs
          </h1>
          <p className="text-sm text-text-muted">
            Review and filter handover logs across groups and dates.
          </p>
        </div>
      </div>

      <Card>
        {hasAccessError ? (
          <div className="space-y-2 rounded-md border border-status-danger/30 bg-status-danger/5 p-4 text-sm text-status-danger">
            <p className="font-semibold">Access denied</p>
            <p className="text-xs text-text-muted">
              You don&apos;t have permission to view handover logs for this
              site. If you think this is a mistake, please contact your site
              administrator.
            </p>
          </div>
        ) : error ? (
          <div className="space-y-2 rounded-md border border-status-danger/30 bg-status-danger/5 p-4 text-sm text-status-danger">
            <p className="font-semibold">Unable to load handover logs</p>
            <p className="text-xs text-text-muted">{error}</p>
            <div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void loadLogs()}
              >
                Retry
              </Button>
            </div>
          </div>
        ) : null}

        <div className="mb-4 mt-2 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:gap-3">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="handover-date-filter"
                className="text-xs font-medium text-text-muted"
              >
                Date
              </label>
              <Input
                id="handover-date-filter"
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full md:w-44"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="handover-status-filter"
                className="text-xs font-medium text-text-muted"
              >
                Status
              </label>
              <Select
                id="handover-status-filter"
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as typeof statusFilter)
                }
                className="w-full md:w-48"
              >
                <option value="all">All statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="PENDING_APPROVAL">Pending approval</option>
                <option value="APPROVED">Approved</option>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="handover-group-filter"
                className="text-xs font-medium text-text-muted"
              >
                Group / class
              </label>
              <Select
                id="handover-group-filter"
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
                className="w-full md:w-52"
              >
                <option value="">All groups</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setDateFilter("");
                setStatusFilter("all");
                setGroupFilter("");
                void loadLogs();
              }}
            >
              Clear filters
            </Button>
            <Button
              size="sm"
              onClick={() => void loadLogs()}
              disabled={isLoading}
            >
              Apply filters
            </Button>
          </div>
        </div>

        <DataTable
          data={logs}
          columns={columns}
          isLoading={isLoading}
          emptyMessage="No handover logs found for the selected filters."
          onRowClick={(row) => router.push(`/admin/handover/${row.id}`)}
        />
      </Card>
    </div>
  );
}

