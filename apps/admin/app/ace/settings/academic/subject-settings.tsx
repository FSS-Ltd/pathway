"use client";

import React from "react";
import { Button, Card } from "@pathway/ui";
import { subscribeToActiveSiteChanges } from "@/lib/active-site-events";
import {
  createAceSubject,
  deactivateAceSubject,
  fetchAceSubjects,
  renameAceSubject,
  type AceSubject,
  type AceSubjectChange,
} from "@/lib/ace-settings-api";
import {
  validateSubjectChange,
  type SubjectAction,
} from "./subject-action-form";
import { SubjectCreateForm } from "./subject-create-form";
import { SubjectList, type SelectedSubjectAction } from "./subject-list";

function upsertSubject(
  subjects: AceSubject[],
  updated: AceSubject,
): AceSubject[] {
  return subjects.some((subject) => subject.id === updated.id)
    ? subjects.map((subject) => (subject.id === updated.id ? updated : subject))
    : [...subjects, updated];
}

export function SubjectSettings({ canManage }: { canManage: boolean }) {
  const [subjects, setSubjects] = React.useState<AceSubject[]>([]);
  const [draft, setDraft] = React.useState<AceSubjectChange>({
    name: "",
    reason: "",
  });
  const [draftErrors, setDraftErrors] = React.useState<
    Partial<Record<keyof AceSubjectChange, string>>
  >({});
  const [action, setAction] = React.useState<SelectedSubjectAction | null>(
    null,
  );
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [siteRevision, setSiteRevision] = React.useState(0);
  const [reloadRevision, setReloadRevision] = React.useState(0);
  const siteGeneration = React.useRef(0);

  React.useEffect(() => {
    const unsubscribe = subscribeToActiveSiteChanges(() => {
      siteGeneration.current += 1;
      setSiteRevision((current) => current + 1);
      setSubjects([]);
      setDraft({ name: "", reason: "" });
      setDraftErrors({});
      setAction(null);
      setError(null);
      setSuccess(null);
      setIsLoading(true);
      setIsSaving(false);
    });
    return () => {
      siteGeneration.current += 1;
      unsubscribe();
    };
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    const generation = siteGeneration.current;
    setIsLoading(true);
    setError(null);
    void fetchAceSubjects(controller.signal)
      .then((loaded) => {
        if (
          !controller.signal.aborted &&
          generation === siteGeneration.current
        ) {
          setSubjects(loaded);
        }
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || generation !== siteGeneration.current)
          return;
        setSubjects([]);
        setError(
          cause instanceof Error ? cause.message : "Unable to load subjects.",
        );
      })
      .finally(() => {
        if (
          !controller.signal.aborted &&
          generation === siteGeneration.current
        ) {
          setIsLoading(false);
        }
      });
    return () => controller.abort();
  }, [siteRevision, reloadRevision]);

  const write = async (
    request: () => Promise<AceSubject>,
    message: string,
    afterSuccess: () => void,
  ) => {
    if (!canManage || isSaving || isLoading) return;
    const generation = siteGeneration.current;
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await request();
      if (generation !== siteGeneration.current) return;
      setSubjects((current) => upsertSubject(current, updated));
      afterSuccess();
      setSuccess(message);
    } catch (cause) {
      if (generation === siteGeneration.current) {
        setError(
          cause instanceof Error ? cause.message : "Unable to save subject.",
        );
      }
    } finally {
      if (generation === siteGeneration.current) setIsSaving(false);
    }
  };

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canManage || isSaving || isLoading) return;
    const validation = validateSubjectChange(draft);
    setDraftErrors(validation);
    if (Object.keys(validation).length) return;
    await write(
      () =>
        createAceSubject({
          name: draft.name.trim(),
          reason: draft.reason.trim(),
        }),
      "Subject created for this site.",
      () => {
        setDraft({ name: "", reason: "" });
        setDraftErrors({});
      },
    );
  };

  const saveAction = async (
    subject: AceSubject,
    type: SubjectAction,
    input: AceSubjectChange,
  ) => {
    await write(
      () =>
        type === "rename"
          ? renameAceSubject(subject.id, input)
          : deactivateAceSubject(subject.id, input.reason),
      type === "rename"
        ? "Subject name saved."
        : "Subject deactivated. Existing placements remain visible.",
      () => setAction(null),
    );
  };

  return (
    <Card
      title="Subjects"
      description="Manage the active site's PACE subjects. Deactivation keeps existing student placements."
    >
      <div className="space-y-5">
        <div aria-live="polite" aria-atomic="true">
          {isLoading ? (
            <p role="status" className="text-sm text-text-muted">
              Loading subjects…
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
            className="min-h-11"
            onClick={() => setReloadRevision((current) => current + 1)}
          >
            Reload subjects
          </Button>
        ) : null}

        {canManage ? (
          <SubjectCreateForm
            draft={draft}
            errors={draftErrors}
            disabled={isLoading || isSaving}
            isSaving={isSaving}
            onChange={(field, value) => {
              setDraft((current) => ({ ...current, [field]: value }));
              setDraftErrors((current) => ({ ...current, [field]: undefined }));
            }}
            onSubmit={create}
          />
        ) : (
          <p className="text-sm text-text-muted">
            You can view subjects. ACE settings management access is required to
            change them.
          </p>
        )}
        <SubjectList
          subjects={subjects}
          isLoading={isLoading}
          hasError={Boolean(error)}
          isSaving={isSaving}
          canManage={canManage}
          action={action}
          onSelectAction={setAction}
          onCancelAction={() => setAction(null)}
          onSaveAction={saveAction}
        />
      </div>
    </Card>
  );
}
