"use client";

import React from "react";
import { Badge, Button, Card } from "@pathway/ui";
import {
  fetchHeadTimetableDraft,
  HeadTimetableRequestError,
  publishHeadTimetable,
  saveHeadTimetableDraft,
  withdrawHeadTimetable,
  type HeadTimetableDraft,
  type TimetableDay,
  type TimetableSchedule,
} from "@/lib/ace-subject-timetable-api";
import { HeadStudentGridFields } from "./head-student-grid-fields";
import {
  HeadStudentPublicationActions,
  type StudentTimetableAction,
} from "./head-student-publication-actions";

type Entry = NonNullable<HeadTimetableDraft["draft"]>["entries"][number];

export function HeadStudentGrid({
  periodId,
  yearBandId,
  child,
  schedule,
  onChanged,
}: {
  periodId: string;
  yearBandId: string;
  child: { id: string; firstName: string; lastName: string };
  schedule: TimetableSchedule;
  onChanged: (action: StudentTimetableAction) => void;
}) {
  const [data, setData] = React.useState<HeadTimetableDraft | null>(null);
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [reason, setReason] = React.useState("");
  const [acknowledgeUnassigned, setAcknowledgeUnassigned] =
    React.useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = React.useState(false);
  const [pending, setPending] = React.useState<
    "save" | "publish" | "withdraw" | null
  >(null);
  const [loading, setLoading] = React.useState(true);
  const [dirty, setDirty] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState(false);
  const [revision, setRevision] = React.useState(0);

  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetchHeadTimetableDraft(
      periodId,
      yearBandId,
      child.id,
      controller.signal,
    )
      .then((loaded) => {
        setData(loaded);
        setEntries(loaded.draft?.entries ?? []);
        setDirty(false);
        setConflict(false);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Student grid could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [periodId, yearBandId, child.id, revision]);

  function changeSubject(day: TimetableDay, slotId: string, subjectId: string) {
    setEntries((current) => [
      ...current.filter(
        (entry) => entry.day !== day || entry.slotId !== slotId,
      ),
      ...(subjectId ? [{ day, slotId, subjectId }] : []),
    ]);
    setDirty(true);
    setSuccess(null);
  }

  const unassignedCount =
    schedule.teachingDays.length *
      schedule.slots.filter((slot) => slot.kind === "LESSON").length -
    entries.length;
  const latest = data?.publications[0];
  const currentPublication = latest && !latest.withdrawnAt ? latest : null;

  async function run(action: StudentTimetableAction) {
    setError(null);
    setSuccess(null);
    setConflict(false);
    if (!reason.trim()) {
      setError("Enter a reason for this change.");
      return;
    }
    if (!data?.schedule) {
      setError("Reload the schedule before changing this student’s grid.");
      return;
    }
    if (action === "publish" && unassignedCount > 0 && !acknowledgeUnassigned) {
      setError(
        `Acknowledge the ${unassignedCount} unassigned lesson cells before publishing.`,
      );
      return;
    }
    if (action === "withdraw" && !confirmWithdraw) {
      setError("Confirm that families should no longer see this publication.");
      return;
    }
    setPending(action);
    try {
      if (action === "save") {
        await saveHeadTimetableDraft(periodId, yearBandId, child.id, {
          scheduleId: data.schedule.id,
          scheduleUpdatedAt: data.schedule.updatedAt,
          expectedVersion: data.draft?.version ?? 0,
          entries,
          reason: reason.trim(),
        });
        setSuccess(
          "Draft saved. Publish separately when it is ready for families.",
        );
      } else if (action === "publish" && data.draft) {
        await publishHeadTimetable(periodId, yearBandId, child.id, {
          expectedVersion: data.draft.version,
          scheduleUpdatedAt: data.schedule.updatedAt,
          acknowledgeUnassigned,
          reason: reason.trim(),
        });
        setSuccess("Subject timetable published to linked families.");
      } else if (action === "withdraw" && currentPublication) {
        await withdrawHeadTimetable(periodId, child.id, {
          publicationId: currentPublication.id,
          reason: reason.trim(),
        });
        setSuccess(
          "Publication withdrawn. Families will not see an older version.",
        );
      }
      setReason("");
      setConfirmWithdraw(false);
      setAcknowledgeUnassigned(false);
      onChanged(action);
      setRevision((value) => value + 1);
    } catch (cause: unknown) {
      setConflict(
        cause instanceof HeadTimetableRequestError && cause.status === 409,
      );
      setError(
        cause instanceof Error
          ? cause.message
          : "Student timetable could not be updated.",
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <Card
      title={`${child.firstName} ${child.lastName} · weekly grid`}
      description="Choose a subject for each lesson. Breaks stay read-only. Saving a draft does not publish it."
    >
      <div className="space-y-5">
        {loading ? (
          <p role="status" className="text-sm text-text-muted">
            Loading student grid…
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
        {conflict ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setRevision((value) => value + 1)}
          >
            Reload latest grid
          </Button>
        ) : null}
        {!loading && data ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={currentPublication ? "success" : "default"}>
                {currentPublication
                  ? "Published"
                  : latest?.withdrawnAt
                    ? "Withdrawn"
                    : data.draft
                      ? "Draft"
                      : "Not started"}
              </Badge>
              {currentPublication ? (
                <span className="text-sm text-text-muted">
                  Published{" "}
                  {new Date(
                    currentPublication.publishedAt,
                  ).toLocaleDateString()}
                </span>
              ) : null}
              {dirty ? (
                <span className="text-sm font-medium text-status-danger">
                  Unsaved changes
                </span>
              ) : null}
            </div>
            {data.eligibleSubjects.length === 0 ? (
              <p className="rounded-lg border border-border-subtle bg-muted px-4 py-3 text-sm text-text-muted">
                No active subject placements overlap this period. Place the
                student in a subject before assigning lessons.
              </p>
            ) : null}
            <HeadStudentGridFields
              schedule={schedule}
              entries={entries}
              subjects={data.eligibleSubjects}
              disabled={Boolean(pending)}
              onChange={changeSubject}
            />
            <HeadStudentPublicationActions
              unassignedCount={unassignedCount}
              draftVersion={data.draft?.version ?? 0}
              hasDraft={Boolean(data.draft)}
              hasPublication={Boolean(currentPublication)}
              dirty={dirty}
              pending={pending}
              reason={reason}
              onReasonChange={setReason}
              acknowledgeUnassigned={acknowledgeUnassigned}
              onAcknowledgeUnassigned={setAcknowledgeUnassigned}
              confirmWithdraw={confirmWithdraw}
              onConfirmWithdraw={setConfirmWithdraw}
              onAction={(action) => void run(action)}
            />
          </>
        ) : null}
      </div>
    </Card>
  );
}
