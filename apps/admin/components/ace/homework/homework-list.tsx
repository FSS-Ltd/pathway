"use client";

import React from "react";
import { Badge, Button, Card, Input, Label } from "@pathway/ui";
import type {
  HomeworkAssignment,
  HomeworkOptions,
} from "@/lib/ace-homework-api";

const statusLabels: Record<HomeworkAssignment["status"], string> = {
  DRAFT: "Draft",
  SCHEDULED: "Scheduled",
  NEEDS_REVIEW: "Needs review",
  PUBLISHED: "Published",
  CANCELLED: "Cancelled",
};

function AssignmentCard({
  item,
  options,
  pending,
  onEdit,
  onAction,
}: {
  item: HomeworkAssignment;
  options: HomeworkOptions;
  pending: boolean;
  onEdit: (item: HomeworkAssignment) => void;
  onAction: (
    item: HomeworkAssignment,
    action: "publish" | "schedule" | "cancel",
    detail?: string,
  ) => void;
}) {
  const [confirm, setConfirm] = React.useState<
    "publish" | "schedule" | "cancel" | null
  >(null);
  const [scheduleAt, setScheduleAt] = React.useState("");
  const [reason, setReason] = React.useState("");
  const band =
    options.yearBands.find((row) => row.id === item.yearBandId)?.name ??
    "Class";
  const subject =
    options.subjects.find((row) => row.id === item.subjectId)?.name ??
    "Subject";
  const canPublish = options.publicationEnabled && item.status === "DRAFT";
  const canSchedule =
    options.publicationEnabled &&
    ["DRAFT", "NEEDS_REVIEW"].includes(item.status);
  const canCancel = item.status !== "CANCELLED";
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!confirm || pending) return;
    const detail =
      confirm === "schedule"
        ? new Date(scheduleAt).toISOString()
        : confirm === "cancel"
          ? reason.trim()
          : undefined;
    onAction(item, confirm, detail);
    setConfirm(null);
  };
  return (
    <li className="min-w-0 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="break-words font-heading font-semibold text-text-primary">
            {item.title}
          </h3>
          <p className="text-sm text-text-muted">
            {band} · {subject} · Due {new Date(item.dueAt).toLocaleString()}
          </p>
        </div>
        <Badge>{statusLabels[item.status]}</Badge>
      </div>
      <p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-sm text-text-secondary">
        {item.instructions}
      </p>
      {item.status === "SCHEDULED" && item.scheduledAt ? (
        <p className="mt-2 text-sm text-text-muted">
          Shares {new Date(item.scheduledAt).toLocaleString()}
        </p>
      ) : null}
      {item.status === "NEEDS_REVIEW" ? (
        <p className="mt-2 text-sm text-text-muted">
          Review the class, subject, due date and staff access before sharing.
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {["DRAFT", "NEEDS_REVIEW"].includes(item.status) ? (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => onEdit(item)}
          >
            Edit draft
          </Button>
        ) : null}
        {canPublish ? (
          <Button
            type="button"
            disabled={pending}
            onClick={() => setConfirm("publish")}
          >
            Publish now
          </Button>
        ) : null}
        {canSchedule ? (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => setConfirm("schedule")}
          >
            Schedule
          </Button>
        ) : null}
        {canCancel ? (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => setConfirm("cancel")}
          >
            Cancel assignment
          </Button>
        ) : null}
      </div>
      {confirm ? (
        <form
          onSubmit={submit}
          className="mt-4 space-y-3 rounded-lg border border-border bg-background p-3"
        >
          <p className="text-sm font-medium text-text-primary">
            {confirm === "publish"
              ? `Share “${item.title}” with the current class roster?`
              : confirm === "schedule"
                ? "Choose when to share this assignment."
                : `Cancel “${item.title}”? Pupils will retain its history.`}
          </p>
          {confirm === "schedule" ? (
            <div className="space-y-1">
              <Label htmlFor={`schedule-${item.id}`}>
                Publication date and time
              </Label>
              <Input
                id={`schedule-${item.id}`}
                type="datetime-local"
                value={scheduleAt}
                onChange={(event) => setScheduleAt(event.target.value)}
                required
              />
            </div>
          ) : null}
          {confirm === "cancel" ? (
            <div className="space-y-1">
              <Label htmlFor={`reason-${item.id}`}>
                Reason for cancellation
              </Label>
              <Input
                id={`reason-${item.id}`}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                minLength={3}
                maxLength={500}
                required
              />
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              {confirm === "publish"
                ? "Confirm publication"
                : confirm === "schedule"
                  ? "Confirm schedule"
                  : "Confirm cancellation"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setConfirm(null)}
            >
              Keep assignment
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  );
}

export function HomeworkList({
  assignments,
  options,
  pendingId,
  onEdit,
  onAction,
}: {
  assignments: HomeworkAssignment[];
  options: HomeworkOptions;
  pendingId: string | null;
  onEdit: (item: HomeworkAssignment) => void;
  onAction: (
    item: HomeworkAssignment,
    action: "publish" | "schedule" | "cancel",
    detail?: string,
  ) => void;
}) {
  return (
    <Card
      title="Assignments"
      description="Drafts stay private until you publish them to the current class roster."
    >
      {assignments.length === 0 ? (
        <p className="text-sm text-text-muted">
          No assignments yet. Create a draft to get started.
        </p>
      ) : (
        <ul className="space-y-3">
          {assignments.map((item) => (
            <AssignmentCard
              key={item.id}
              item={item}
              options={options}
              pending={pendingId !== null}
              onEdit={onEdit}
              onAction={onAction}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}
