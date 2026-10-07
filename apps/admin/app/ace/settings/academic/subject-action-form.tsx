"use client";

import React from "react";
import { Button, Input, Label } from "@pathway/ui";
import type { AceSubject, AceSubjectChange } from "@/lib/ace-settings-api";

export type SubjectAction = "rename" | "deactivate";

export function validateSubjectChange(
  input: AceSubjectChange,
  requireName = true,
): Partial<Record<keyof AceSubjectChange, string>> {
  const errors: Partial<Record<keyof AceSubjectChange, string>> = {};
  if (requireName && (!input.name.trim() || input.name.trim().length > 120)) {
    errors.name = "Enter a subject name of up to 120 characters.";
  }
  if (!input.reason.trim() || input.reason.trim().length > 1_000) {
    errors.reason = "Enter a reason of up to 1,000 characters.";
  }
  return errors;
}

type SubjectActionFormProps = {
  subject: AceSubject;
  action: SubjectAction;
  isSaving: boolean;
  onCancel: () => void;
  onSubmit: (input: AceSubjectChange) => Promise<void>;
};

export function SubjectActionForm({
  subject,
  action,
  isSaving,
  onCancel,
  onSubmit,
}: SubjectActionFormProps) {
  const [input, setInput] = React.useState<AceSubjectChange>({
    name: subject.name,
    reason: "",
  });
  const [errors, setErrors] = React.useState<
    Partial<Record<keyof AceSubjectChange, string>>
  >({});
  const isRename = action === "rename";

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;
    const validation = validateSubjectChange(input, isRename);
    setErrors(validation);
    if (Object.keys(validation).length) return;
    await onSubmit({ name: input.name.trim(), reason: input.reason.trim() });
  };

  return (
    <form
      onSubmit={submit}
      className="mt-4 space-y-4 border-t border-border-subtle pt-4"
    >
      {isRename ? (
        <div className="space-y-2">
          <Label htmlFor={`subject-name-${subject.id}`}>Subject name</Label>
          <Input
            id={`subject-name-${subject.id}`}
            autoFocus
            value={input.name}
            maxLength={120}
            disabled={isSaving}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={
              errors.name ? `subject-name-error-${subject.id}` : undefined
            }
            onChange={(event) => {
              setInput((current) => ({ ...current, name: event.target.value }));
              setErrors((current) => ({ ...current, name: undefined }));
            }}
          />
          {errors.name ? (
            <p
              id={`subject-name-error-${subject.id}`}
              className="text-sm text-status-danger"
            >
              {errors.name}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-text-muted">
          This stops new PACE placements in {subject.name}. Existing placements
          remain visible.
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor={`subject-reason-${subject.id}`}>
          Reason for change
        </Label>
        <Input
          id={`subject-reason-${subject.id}`}
          autoFocus={!isRename}
          value={input.reason}
          maxLength={1_000}
          disabled={isSaving}
          aria-invalid={Boolean(errors.reason)}
          aria-describedby={
            errors.reason ? `subject-reason-error-${subject.id}` : undefined
          }
          onChange={(event) => {
            setInput((current) => ({ ...current, reason: event.target.value }));
            setErrors((current) => ({ ...current, reason: undefined }));
          }}
        />
        {errors.reason ? (
          <p
            id={`subject-reason-error-${subject.id}`}
            className="text-sm text-status-danger"
          >
            {errors.reason}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          variant={isRename ? "primary" : "destructive"}
          disabled={isSaving}
          className="min-h-11"
        >
          {isSaving ? "Saving…" : isRename ? "Save name" : "Deactivate subject"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={isSaving}
          onClick={onCancel}
          className="min-h-11"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
