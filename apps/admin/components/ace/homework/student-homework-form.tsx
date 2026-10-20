"use client";

import React from "react";
import { Button, Card } from "@pathway/ui";
import {
  saveStudentHomeworkDraft,
  submitStudentHomework,
  uploadStudentHomeworkEvidence,
  type StudentHomeworkAssignment,
} from "@/lib/ace-student-homework-api";

const allowedTypes = new Set(["application/pdf", "image/png", "image/jpeg"]);
const maxBytes = 2 * 1024 * 1024;

export function StudentHomeworkForm({
  assignment,
  siteId,
  enabled,
  onChanged,
}: {
  assignment: StudentHomeworkAssignment;
  siteId: string;
  enabled: boolean;
  onChanged: () => Promise<void>;
}) {
  const [text, setText] = React.useState(
    assignment.submission?.draftText ?? "",
  );
  const [file, setFile] = React.useState<File | null>(null);
  const [evidenceId, setEvidenceId] = React.useState<string | undefined>();
  const [uploadedName, setUploadedName] = React.useState("");
  const [pending, setPending] = React.useState<
    "save" | "upload" | "submit" | null
  >(null);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const retryKey = React.useRef<string | null>(null);
  const submitted = assignment.submission?.status === "SUBMITTED";
  const canEdit = enabled && !submitted;

  async function run(
    kind: "save" | "upload" | "submit",
    action: () => Promise<void>,
  ) {
    setPending(kind);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Homework could not be saved.",
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-5">
      <Card
        title="Assignment"
        description={`Due ${new Date(assignment.dueAt).toLocaleString()}`}
      >
        <p className="whitespace-pre-wrap text-sm leading-6 text-text-primary">
          {assignment.instructions}
        </p>
      </Card>
      {assignment.submission?.versions.length ? (
        <Card title="Submission history">
          <ol className="space-y-3">
            {assignment.submission.versions.map((version) => (
              <li
                key={version.id}
                className="border-b border-border-subtle pb-3 last:border-0 last:pb-0"
              >
                <p className="text-sm font-medium text-text-primary">
                  Version {version.number} ·{" "}
                  {new Date(version.submittedAt).toLocaleString()}
                  {version.late ? " · Submitted after due time" : ""}
                </p>
                {version.text ? (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-text-muted">
                    {version.text}
                  </p>
                ) : null}
                {version.evidence ? (
                  <p className="mt-1 text-sm text-text-muted">
                    Evidence: {version.evidence.fileName}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </Card>
      ) : null}
      {canEdit ? (
        <Card
          title={
            assignment.submission?.status === "RETURNED"
              ? "Revise your work"
              : "Your work"
          }
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor={`answer-${assignment.id}`}
                className="block text-sm font-medium text-text-primary"
              >
                Written answer
              </label>
              <textarea
                id={`answer-${assignment.id}`}
                value={text}
                maxLength={5000}
                rows={7}
                disabled={pending !== null}
                onChange={(event) => {
                  setText(event.target.value);
                  retryKey.current = null;
                }}
                className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong disabled:opacity-60"
              />
              <p className="text-xs text-text-muted">
                {text.length}/5000 characters
              </p>
            </div>
            <div className="space-y-2">
              <label
                htmlFor={`evidence-${assignment.id}`}
                className="block text-sm font-medium text-text-primary"
              >
                Evidence file (optional)
              </label>
              <input
                id={`evidence-${assignment.id}`}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                disabled={pending !== null}
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setEvidenceId(undefined);
                  setUploadedName("");
                  retryKey.current = null;
                }}
                className="block w-full text-sm text-text-primary file:mr-3 file:rounded-md file:border file:border-border-subtle file:bg-surface file:px-3 file:py-2 file:text-sm file:font-medium file:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
              />
              <p className="text-xs text-text-muted">
                PDF, PNG or JPEG, up to 2 MB. Files are safety checked before
                submission.
              </p>
              {uploadedName ? (
                <p role="status" className="text-sm text-text-primary">
                  Ready: {uploadedName}
                </p>
              ) : null}
            </div>
            {error ? (
              <p role="alert" className="text-sm text-status-danger">
                {error}
              </p>
            ) : null}
            {notice ? (
              <p role="status" className="text-sm text-text-primary">
                {notice}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={pending !== null}
                onClick={() =>
                  void run("save", async () => {
                    await saveStudentHomeworkDraft(siteId, assignment.id, text);
                    setNotice("Draft saved.");
                    await onChanged();
                  })
                }
              >
                {pending === "save" ? "Saving…" : "Save draft"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending !== null || !file || Boolean(evidenceId)}
                onClick={() =>
                  void run("upload", async () => {
                    if (
                      !file ||
                      !allowedTypes.has(file.type) ||
                      file.size < 1 ||
                      file.size > maxBytes
                    ) {
                      throw new Error("Choose a PDF, PNG or JPEG under 2 MB.");
                    }
                    const id = await uploadStudentHomeworkEvidence(
                      siteId,
                      assignment.id,
                      file,
                    );
                    setEvidenceId(id);
                    setUploadedName(file.name);
                    setNotice("Evidence passed the safety check.");
                  })
                }
              >
                {pending === "upload" ? "Checking file…" : "Upload evidence"}
              </Button>
              <Button
                type="button"
                disabled={
                  pending !== null ||
                  (!text.trim() && !evidenceId) ||
                  (Boolean(file) && !evidenceId)
                }
                onClick={() =>
                  void run("submit", async () => {
                    retryKey.current ??= crypto.randomUUID();
                    await submitStudentHomework(siteId, assignment.id, {
                      text,
                      evidenceId,
                      idempotencyKey: retryKey.current,
                    });
                    setNotice("Homework submitted.");
                    await onChanged();
                  })
                }
              >
                {pending === "submit" ? "Submitting…" : "Submit work"}
              </Button>
            </div>
          </div>
        </Card>
      ) : !enabled && !submitted ? (
        <Card title="Submissions unavailable">
          <p role="status" className="text-sm text-text-muted">
            Your school has not enabled homework submissions yet.
          </p>
        </Card>
      ) : (
        <Card title="Submitted">
          <p role="status" className="text-sm text-text-muted">
            Your work has been sent to the school.
          </p>
        </Card>
      )}
    </div>
  );
}
