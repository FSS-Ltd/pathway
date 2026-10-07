"use client";

import React from "react";
import { Badge, Button } from "@pathway/ui";
import type { AceSubject, AceSubjectChange } from "@/lib/ace-settings-api";
import { SubjectActionForm, type SubjectAction } from "./subject-action-form";

export type SelectedSubjectAction = { subjectId: string; type: SubjectAction };

type SubjectListProps = {
  subjects: AceSubject[];
  isLoading: boolean;
  hasError: boolean;
  isSaving: boolean;
  canManage: boolean;
  action: SelectedSubjectAction | null;
  onSelectAction: (action: SelectedSubjectAction) => void;
  onCancelAction: () => void;
  onSaveAction: (
    subject: AceSubject,
    action: SubjectAction,
    input: AceSubjectChange,
  ) => Promise<void>;
};

export function SubjectList({
  subjects,
  isLoading,
  hasError,
  isSaving,
  canManage,
  action,
  onSelectAction,
  onCancelAction,
  onSaveAction,
}: SubjectListProps) {
  if (isLoading) return null;
  if (subjects.length === 0) {
    return hasError ? null : (
      <p className="rounded-lg border border-dashed border-border-subtle p-5 text-sm text-text-muted">
        {canManage
          ? "No subjects at this site yet. Add one before placing students into PACE subjects."
          : "No subjects have been set up at this site."}
      </p>
    );
  }

  const ordered = [
    ...subjects.filter((subject) => subject.isActive),
    ...subjects.filter((subject) => !subject.isActive),
  ];

  return (
    <ul
      aria-label="Site subjects"
      className="divide-y divide-border-subtle rounded-lg border border-border-subtle bg-surface"
    >
      {ordered.map((subject) => {
        const selected = action?.subjectId === subject.id ? action.type : null;
        return (
          <li key={subject.id} className="px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="font-medium text-text-primary">
                  {subject.name}
                </span>
                <Badge variant={subject.isActive ? "success" : "secondary"}>
                  {subject.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
              {canManage && subject.isActive && !selected ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={isSaving}
                    className="min-h-11"
                    aria-label={`Rename ${subject.name}`}
                    onClick={() =>
                      onSelectAction({ subjectId: subject.id, type: "rename" })
                    }
                  >
                    Rename
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={isSaving}
                    className="min-h-11 text-status-danger"
                    aria-label={`Deactivate ${subject.name}`}
                    onClick={() =>
                      onSelectAction({
                        subjectId: subject.id,
                        type: "deactivate",
                      })
                    }
                  >
                    Deactivate
                  </Button>
                </div>
              ) : null}
            </div>
            {canManage && selected ? (
              <SubjectActionForm
                key={`${subject.id}:${selected}`}
                subject={subject}
                action={selected}
                isSaving={isSaving}
                onCancel={onCancelAction}
                onSubmit={(input) => onSaveAction(subject, selected, input)}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
