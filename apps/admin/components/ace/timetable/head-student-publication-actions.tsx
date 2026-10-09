"use client";

import React from "react";
import { Button } from "@pathway/ui";

export type StudentTimetableAction = "save" | "publish" | "withdraw";

export function HeadStudentPublicationActions({
  unassignedCount,
  draftVersion,
  hasDraft,
  hasPublication,
  dirty,
  pending,
  reason,
  onReasonChange,
  acknowledgeUnassigned,
  onAcknowledgeUnassigned,
  confirmWithdraw,
  onConfirmWithdraw,
  onAction,
}: {
  unassignedCount: number;
  draftVersion: number;
  hasDraft: boolean;
  hasPublication: boolean;
  dirty: boolean;
  pending: StudentTimetableAction | null;
  reason: string;
  onReasonChange: (value: string) => void;
  acknowledgeUnassigned: boolean;
  onAcknowledgeUnassigned: (value: boolean) => void;
  confirmWithdraw: boolean;
  onConfirmWithdraw: (value: boolean) => void;
  onAction: (action: StudentTimetableAction) => void;
}) {
  return (
    <>
      <p className="text-sm text-text-muted">
        {unassignedCount} unassigned lesson{" "}
        {unassignedCount === 1 ? "cell" : "cells"} · Draft version{" "}
        {draftVersion}
      </p>
      <label className="block text-sm font-medium text-text-primary">
        Reason for this change
        <input
          id="student-grid-reason"
          value={reason}
          maxLength={1000}
          disabled={Boolean(pending)}
          onChange={(event) => onReasonChange(event.target.value)}
          className="mt-1 min-h-11 w-full rounded-lg border border-border-subtle bg-surface px-3 text-sm text-text-primary"
        />
      </label>
      {unassignedCount > 0 ? (
        <label className="flex min-h-11 items-center gap-3 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={acknowledgeUnassigned}
            disabled={Boolean(pending)}
            onChange={(event) => onAcknowledgeUnassigned(event.target.checked)}
            className="accent-accent-strong"
          />
          I understand that {unassignedCount} lesson{" "}
          {unassignedCount === 1 ? "cell is" : "cells are"} unassigned.
        </label>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={Boolean(pending)}
          onClick={() => onAction("save")}
          className="min-h-11"
        >
          {pending === "save" ? "Saving…" : "Save draft"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={Boolean(pending) || !hasDraft || dirty}
          onClick={() => onAction("publish")}
          className="min-h-11"
        >
          {pending === "publish" ? "Publishing…" : "Publish to families"}
        </Button>
      </div>
      {hasPublication ? (
        <div className="space-y-3 border-t border-border-subtle pt-5">
          <h3 className="text-sm font-semibold text-text-primary">
            Withdraw current publication
          </h3>
          <label className="flex min-h-11 items-center gap-3 text-sm text-text-muted">
            <input
              type="checkbox"
              checked={confirmWithdraw}
              disabled={Boolean(pending)}
              onChange={(event) => onConfirmWithdraw(event.target.checked)}
            />
            I understand linked families will no longer see this version.
          </label>
          <Button
            type="button"
            variant="outline"
            disabled={Boolean(pending) || !confirmWithdraw}
            onClick={() => onAction("withdraw")}
            className="min-h-11"
          >
            {pending === "withdraw" ? "Withdrawing…" : "Withdraw publication"}
          </Button>
        </div>
      ) : null}
    </>
  );
}
