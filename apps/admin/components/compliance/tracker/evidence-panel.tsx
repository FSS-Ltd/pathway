"use client";
import React from "react";
import type { TrackerRequirement } from "@pathway/types";
import { trackerClient, downloadTrackerEvidence } from "@/lib/tracker-client";
import { readAgreementPdf } from "@/lib/agreements-client";
import {
  Action,
  Feedback,
  fieldClass,
  useAgreementRequest,
} from "../agreements/shared";
import { useAgreementPage } from "../agreements/use-agreement-page";
export function EvidencePanel({
  requirement,
  canManage,
  onChange,
}: {
  requirement: Pick<TrackerRequirement, "id" | "version">;
  canManage: boolean;
  onChange: () => void;
}) {
  const load = React.useCallback(
    (signal: AbortSignal, cursor?: string) =>
      trackerClient.evidence(requirement.id, signal, cursor),
    [requirement.id],
  );
  const page = useAgreementPage(load);
  const request = useAgreementRequest();
  const [title, setTitle] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [uploadKey, setUploadKey] = React.useState(0);
  return (
    <section className="space-y-3">
      <h4 className="font-semibold">Supporting evidence</h4>
      <p className="text-sm text-text-muted">
        Evidence is separate from manual confirmation.
        {canManage
          ? " Upload a PDF up to 2 MiB."
          : " Historical records remain available for review."}
      </p>
      <Feedback busy={page.busy} error={page.error} success="" />
      {page.error && (
        <Action onClick={() => void page.refresh()}>Retry evidence</Action>
      )}
      {!page.busy && !page.error && !page.items.length && (
        <p>No evidence has been recorded.</p>
      )}
      {page.items.map((value) => (
        <article
          key={value.id}
          className="space-y-2 border-b border-border-subtle py-3"
        >
          <h5 className="break-words font-medium">
            {value.title} {value.archivedAt ? "(archived)" : ""}
          </h5>
          <p className="whitespace-pre-wrap break-words">{value.notes}</p>
          <p className="text-sm text-text-muted">
            Requirement version {value.requirementVersion} ·{" "}
            {new Date(value.createdAt).toLocaleString()}
          </p>
          <div className="flex flex-wrap gap-2">
            <Action
              variant="secondary"
              disabled={request.busy}
              onClick={() =>
                void request.run((signal) =>
                  downloadTrackerEvidence(value.id, signal),
                )
              }
            >
              Download {value.fileName}
            </Action>
            {canManage && !value.archivedAt && (
              <Action
                variant="secondary"
                disabled={request.busy}
                onClick={() =>
                  void request.run(async (signal) => {
                    await trackerClient.archive(value.id, signal);
                    if (!signal.aborted) {
                      void page.refresh();
                      onChange();
                    }
                  }, "Evidence archived. Its history is retained.")
                }
              >
                Archive evidence
              </Action>
            )}
          </div>
        </article>
      ))}
      {page.cursor && (
        <Action
          disabled={page.busy}
          onClick={() => void page.refresh(page.cursor ?? undefined)}
        >
          Load more evidence
        </Action>
      )}
      {canManage && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void request.run(async (signal) => {
              if (!file) throw new Error("Choose a PDF to upload.");
              const pdf = await readAgreementPdf(file);
              if (signal.aborted) return;
              await trackerClient.upload(
                {
                  requirementId: requirement.id,
                  requirementVersion: requirement.version,
                  title,
                  notes,
                  pdf,
                },
                signal,
              );
              if (!signal.aborted) {
                setTitle("");
                setNotes("");
                setFile(null);
                setUploadKey((value) => value + 1);
                void page.refresh();
                onChange();
              }
            }, "Evidence recorded.");
          }}
        >
          <fieldset className="min-w-0 space-y-3" disabled={request.busy}>
            <legend className="max-w-full whitespace-normal font-medium">
              Add evidence
            </legend>
            <label className="block">
              Evidence title
              <input
                className={fieldClass}
                required
                maxLength={200}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="block">
              Evidence notes
              <textarea
                className={fieldClass}
                maxLength={5000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <label className="block min-w-0">
              Evidence PDF
              <input
                className={fieldClass}
                key={uploadKey}
                type="file"
                accept="application/pdf,.pdf"
                required
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <Action type="submit" disabled={!file}>
              Upload evidence
            </Action>
          </fieldset>
        </form>
      )}
      <Feedback {...request} />
    </section>
  );
}
