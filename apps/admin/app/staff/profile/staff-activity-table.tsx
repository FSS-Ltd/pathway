"use client";

import React from "react";
import Link from "next/link";
import { Check, ClipboardList, X } from "lucide-react";
import { Badge, Button, DataTable, type ColumnDef } from "@pathway/ui";
import type { StaffProfileDetail } from "@/lib/api-client";

type Assignment = NonNullable<StaffProfileDetail["assignments"]>[number];

function formatSessionDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffDays = Math.round((date.getTime() - now.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  if (diffDays > 0 && diffDays <= 7) return `In ${diffDays}d`;
  if (diffDays < 0 && diffDays >= -7) return `${-diffDays}d ago`;
  return date.toLocaleDateString();
}

export function StaffActivityTable({
  assignments,
  hasAssignments,
  busyId,
  filterKey,
  onAccept,
  onDecline,
}: {
  assignments: Assignment[];
  hasAssignments: boolean;
  busyId: string | null;
  filterKey: string;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
}) {
  const columns: ColumnDef<Assignment>[] = [
    {
      id: "session",
      header: "Session",
      cell: (assignment) => (
        <div>
          <span className="font-semibold text-text-primary">
            {assignment.session.title}
          </span>
          {assignment.session.groups?.length > 0 && (
            <p className="text-xs text-text-muted">
              {assignment.session.groups.map((group) => group.name).join(", ")}
            </p>
          )}
        </div>
      ),
    },
    {
      id: "date",
      header: "Date",
      cell: (assignment) => formatSessionDate(assignment.session.startsAt),
      priority: "secondary",
    },
    {
      id: "status",
      header: "Status",
      cell: (assignment) => (
        <Badge
          variant={
            assignment.status === "PENDING"
              ? "warning"
              : assignment.status === "CONFIRMED"
                ? "success"
                : "secondary"
          }
        >
          {assignment.status === "PENDING" ? "Pending" : assignment.status}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      cell: (assignment) => {
        const pending = assignment.status === "PENDING";
        const busy = busyId === assignment.id;
        const marked = assignment.session.attendanceMarked ?? 0;
        const total = assignment.session.attendanceTotal ?? 0;
        const attendanceComplete = total > 0 && marked >= total;
        return (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              disabled={!pending || busy}
              onClick={() => onAccept(assignment.id)}
              aria-label="Accept serve request"
              title={pending ? "Accept serve request" : "Already responded"}
              className="size-8 p-0"
            >
              <Check className="size-4" />
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={!pending || busy}
              onClick={() => onDecline(assignment.id)}
              aria-label="Decline serve request"
              title={pending ? "Decline serve request" : "Already responded"}
              className="size-8 p-0"
            >
              <X className="size-4" />
            </Button>
            <Button
              size="sm"
              variant="secondary"
              asChild
              title={
                attendanceComplete
                  ? "Attendance already submitted"
                  : "Take attendance"
              }
              className={
                attendanceComplete ? "size-8 p-0 opacity-50" : "size-8 p-0"
              }
            >
              <Link
                href={`/attendance/${assignment.session.id}`}
                aria-label={
                  attendanceComplete
                    ? "Attendance already submitted"
                    : "Take attendance"
                }
              >
                <ClipboardList className="size-4" />
              </Link>
            </Button>
          </div>
        );
      },
    },
  ];
  return (
    <DataTable
      data={assignments}
      columns={columns}
      caption="My session activity"
      rowKey={(assignment) => assignment.id}
      pagination={{ mode: "client", resetKey: filterKey }}
      emptyMessage={
        hasAssignments
          ? "No sessions in this date range. Adjust the filter to see older or future dates."
          : "No sessions assigned yet."
      }
    />
  );
}
