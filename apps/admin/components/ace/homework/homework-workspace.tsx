"use client";

import React from "react";
import { Button } from "@pathway/ui";
import { NoAccessCard } from "@/components/no-access-card";
import { subscribeToActiveSiteChanges } from "@/lib/active-site-events";
import {
  cancelHomeworkAssignment,
  createHomeworkAssignment,
  fetchHomeworkAssignments,
  fetchHomeworkOptions,
  publishHomeworkAssignment,
  scheduleHomeworkAssignment,
  updateHomeworkAssignment,
  type HomeworkAssignment,
  type HomeworkDraft,
  type HomeworkOptions,
  HomeworkRequestError,
} from "@/lib/ace-homework-api";
import { requestFailure } from "@/lib/request-error";
import { useAdminAccess } from "@/lib/use-admin-access";
import { HomeworkForm } from "./homework-form";
import { HomeworkList } from "./homework-list";

function homeworkError(cause: unknown): string {
  if (cause instanceof HomeworkRequestError) {
    if (cause.status === 400)
      return "Check the class, subject and due date, then try again.";
    if (cause.status === 409)
      return "This assignment changed. Reload it before trying again.";
    if (cause.status === 503)
      return "Homework publication is not available yet.";
  }
  return requestFailure(
    cause,
    "Unable to save assignment. Reload and try again.",
  ).message;
}

export function HomeworkWorkspace() {
  const { permissions, isLoading: accessLoading } = useAdminAccess();
  const canManage =
    permissions?.includes("ace.homework.assignments.manage") === true;
  const [assignments, setAssignments] = React.useState<HomeworkAssignment[]>(
    [],
  );
  const [options, setOptions] = React.useState<HomeworkOptions | null>(null);
  const [editing, setEditing] = React.useState<
    HomeworkAssignment | null | "new"
  >(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [revision, setRevision] = React.useState(0);
  const siteGeneration = React.useRef(0);

  React.useEffect(
    () =>
      subscribeToActiveSiteChanges(() => {
        siteGeneration.current += 1;
        setAssignments([]);
        setOptions(null);
        setEditing(null);
        setPendingId(null);
        setError(null);
        setSuccess(null);
        setRevision((value) => value + 1);
      }),
    [],
  );

  React.useEffect(() => {
    if (accessLoading || !canManage) return;
    const controller = new AbortController();
    const generation = siteGeneration.current;
    setIsLoading(true);
    setError(null);
    void Promise.all([
      fetchHomeworkAssignments(controller.signal),
      fetchHomeworkOptions(controller.signal),
    ])
      .then(([items, choices]) => {
        if (controller.signal.aborted || generation !== siteGeneration.current)
          return;
        setAssignments(items);
        setOptions(choices);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || generation !== siteGeneration.current)
          return;
        setError(requestFailure(cause, "Unable to load assignments.").message);
      })
      .finally(() => {
        if (!controller.signal.aborted && generation === siteGeneration.current)
          setIsLoading(false);
      });
    return () => controller.abort();
  }, [accessLoading, canManage, revision]);

  const perform = async (
    key: string,
    operation: () => Promise<HomeworkAssignment>,
    message: string,
  ) => {
    if (pendingId) return;
    const generation = siteGeneration.current;
    setPendingId(key);
    setError(null);
    setSuccess(null);
    try {
      const result = await operation();
      if (generation !== siteGeneration.current) return;
      setAssignments((current) => [
        result,
        ...current.filter((item) => item.id !== result.id),
      ]);
      setEditing(null);
      setSuccess(message);
    } catch (cause) {
      if (generation === siteGeneration.current) setError(homeworkError(cause));
    } finally {
      if (generation === siteGeneration.current) setPendingId(null);
    }
  };

  const save = (draft: HomeworkDraft) =>
    perform(
      editing === "new" ? "new" : (editing?.id ?? "new"),
      () =>
        editing && editing !== "new"
          ? updateHomeworkAssignment(editing.id, draft, editing.version)
          : createHomeworkAssignment(draft),
      editing === "new" ? "Draft created." : "Draft saved.",
    );

  const action = (
    item: HomeworkAssignment,
    type: "publish" | "schedule" | "cancel",
    detail?: string,
  ) => {
    void perform(
      item.id,
      () => {
        if (type === "publish")
          return publishHomeworkAssignment(item.id, item.version);
        if (type === "schedule" && detail)
          return scheduleHomeworkAssignment(item.id, item.version, detail);
        if (type === "cancel" && detail)
          return cancelHomeworkAssignment(item.id, item.version, detail);
        throw new Error("Complete the confirmation fields.");
      },
      type === "publish"
        ? "Assignment published."
        : type === "schedule"
          ? "Publication scheduled."
          : "Assignment cancelled.",
    );
  };

  if (accessLoading)
    return (
      <p role="status" className="text-sm text-text-muted">
        Checking homework access…
      </p>
    );
  if (!canManage)
    return (
      <NoAccessCard
        title="Homework"
        message="You do not have permission to manage homework assignments."
      />
    );

  return (
    <div className="min-w-0 space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-text-primary">
            Homework
          </h1>
          <p className="text-sm text-text-muted">
            Prepare class assignments for the active ACE site.
          </p>
        </div>
        {!editing && options ? (
          <Button type="button" onClick={() => setEditing("new")}>
            New assignment
          </Button>
        ) : null}
      </header>
      {options && !options.publicationEnabled ? (
        <p
          role="status"
          className="rounded-lg border border-border bg-surface p-3 text-sm text-text-muted"
        >
          Drafts are available. Publication will open after the school security
          review.
        </p>
      ) : null}
      <div aria-live="polite" aria-atomic="true">
        {isLoading ? (
          <p role="status" className="text-sm text-text-muted">
            Loading assignments…
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-status-danger">
            {error}
          </p>
        ) : null}
        {success ? (
          <p role="status" className="text-sm text-status-success">
            {success}
          </p>
        ) : null}
      </div>
      {error && !isLoading ? (
        <Button
          type="button"
          variant="secondary"
          onClick={() => setRevision((value) => value + 1)}
        >
          Reload assignments
        </Button>
      ) : null}
      {options && editing ? (
        <HomeworkForm
          key={editing === "new" ? "new" : editing.id}
          options={options}
          editing={editing === "new" ? null : editing}
          pending={pendingId !== null}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {options && !isLoading ? (
        <HomeworkList
          assignments={assignments}
          options={options}
          pendingId={pendingId}
          onEdit={setEditing}
          onAction={action}
        />
      ) : null}
    </div>
  );
}
