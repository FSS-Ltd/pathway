"use client";

import React from "react";
import { Button, Input, Label } from "@pathway/ui";
import type { AceSubjectChange } from "@/lib/ace-settings-api";

type SubjectCreateFormProps = {
  draft: AceSubjectChange;
  errors: Partial<Record<keyof AceSubjectChange, string>>;
  disabled: boolean;
  isSaving: boolean;
  onChange: (field: keyof AceSubjectChange, value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
};

export function SubjectCreateForm({
  draft,
  errors,
  disabled,
  isSaving,
  onChange,
  onSubmit,
}: SubjectCreateFormProps) {
  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-lg border border-border-subtle bg-muted/30 p-4"
    >
      <p className="text-sm font-semibold text-text-primary">Add a subject</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="ace-subject-name">Subject name</Label>
          <Input
            id="ace-subject-name"
            value={draft.name}
            maxLength={120}
            disabled={disabled}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={
              errors.name ? "ace-subject-name-error" : undefined
            }
            onChange={(event) => onChange("name", event.target.value)}
          />
          {errors.name ? (
            <p
              id="ace-subject-name-error"
              className="text-sm text-status-danger"
            >
              {errors.name}
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="ace-subject-reason">Reason for adding</Label>
          <Input
            id="ace-subject-reason"
            value={draft.reason}
            maxLength={1_000}
            disabled={disabled}
            aria-invalid={Boolean(errors.reason)}
            aria-describedby={
              errors.reason ? "ace-subject-reason-error" : undefined
            }
            onChange={(event) => onChange("reason", event.target.value)}
          />
          {errors.reason ? (
            <p
              id="ace-subject-reason-error"
              className="text-sm text-status-danger"
            >
              {errors.reason}
            </p>
          ) : null}
        </div>
      </div>
      <Button type="submit" disabled={disabled} className="min-h-11">
        {isSaving ? "Saving…" : "Create subject"}
      </Button>
    </form>
  );
}
