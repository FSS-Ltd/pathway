"use client";

import React from "react";
import { Button, Card } from "@pathway/ui";
import { subscribeToActiveSiteChanges } from "@/lib/active-site-events";
import { AdminPaceApiError } from "@/lib/api-client";
import type {
  PaceDiagnosticCommandResult,
  RecordPaceDiagnosticInput,
} from "@/lib/pace-diagnostic-api";

type Props = {
  childId: string;
  subjectId: string;
  childName: string;
  subjectName: string;
  onRecord: (
    input: RecordPaceDiagnosticInput,
  ) => Promise<PaceDiagnosticCommandResult>;
  onRecorded: () => void;
};

export function PaceDiagnosticRecordForm({
  childId,
  subjectId,
  childName,
  subjectName,
  onRecord,
  onRecorded,
}: Props) {
  const [level, setLevel] = React.useState("");
  const [outcome, setOutcome] = React.useState<"" | "PASS" | "FAIL">("");
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const submitting = React.useRef(false);
  const siteGeneration = React.useRef(0);
  const successRef = React.useRef<HTMLParagraphElement>(null);
  const levelId = React.useId();
  const outcomeName = React.useId();

  React.useEffect(() => {
    const unsubscribe = subscribeToActiveSiteChanges(() => {
      siteGeneration.current += 1;
    });
    return () => {
      siteGeneration.current += 1;
      unsubscribe();
    };
  }, []);
  React.useEffect(() => {
    if (success) successRef.current?.focus();
  }, [success]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || pending) return;
    if (!level || !outcome) {
      setError("Choose a diagnostic level and outcome.");
      return;
    }
    submitting.current = true;
    const requestGeneration = siteGeneration.current;
    setPending(true);
    setError(null);
    setSuccess(false);
    try {
      await onRecord({ childId, subjectId, level: Number(level), outcome });
      if (requestGeneration !== siteGeneration.current) return;
      setLevel("");
      setOutcome("");
      setSuccess(true);
      onRecorded();
    } catch (cause) {
      if (requestGeneration !== siteGeneration.current) return;
      setError(
        cause instanceof AdminPaceApiError && cause.status < 500
          ? cause.message
          : "Unable to record the diagnostic. Please try again.",
      );
    } finally {
      submitting.current = false;
      if (requestGeneration === siteGeneration.current) setPending(false);
    }
  }

  return (
    <Card
      title="Record diagnostic"
      description={`For ${childName} · ${subjectName}. The assigned PACE will not change.`}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <label
            htmlFor={levelId}
            className="block text-sm font-medium text-text-primary"
          >
            Diagnostic level
          </label>
          <select
            id={levelId}
            value={level}
            disabled={pending}
            onChange={(event) => {
              setLevel(event.currentTarget.value);
              setError(null);
              setSuccess(false);
            }}
            className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface px-3 text-sm text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong sm:max-w-xs"
          >
            <option value="">Choose a level</option>
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                Level {value}
              </option>
            ))}
          </select>
        </div>
        <fieldset disabled={pending} className="space-y-2">
          <legend className="text-sm font-medium text-text-primary">
            Outcome
          </legend>
          <div className="flex flex-wrap gap-2">
            {(["PASS", "FAIL"] as const).map((value) => (
              <label
                key={value}
                className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border-subtle bg-surface px-4 text-sm text-text-primary has-[:checked]:border-accent-strong has-[:checked]:bg-accent-subtle has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-strong"
              >
                <input
                  type="radio"
                  name={outcomeName}
                  value={value}
                  checked={outcome === value}
                  onChange={() => {
                    setOutcome(value);
                    setError(null);
                    setSuccess(false);
                  }}
                />
                {value === "PASS" ? "Pass" : "Fail"}
              </label>
            ))}
          </div>
        </fieldset>
        {error ? (
          <p role="alert" className="text-sm text-status-danger">
            {error}
          </p>
        ) : null}
        {success ? (
          <p
            ref={successRef}
            tabIndex={-1}
            role="status"
            className="text-sm text-status-ok"
          >
            Diagnostic recorded. History has been refreshed.
          </p>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Recording…" : "Record diagnostic"}
        </Button>
      </form>
    </Card>
  );
}
