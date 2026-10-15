"use client";
import React from "react";
import type { AgreementDocument } from "@pathway/types";
import { agreementsClient, readAgreementPdf } from "@/lib/agreements-client";
import { Action, Feedback, fieldClass, useAgreementRequest } from "./shared";
export function PublishForm({
  document,
  onPublished,
  onCancel,
}: {
  document?: AgreementDocument;
  onPublished: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = React.useState(document?.latestVersion.title ?? "");
  const [content, setContent] = React.useState(
    document?.latestVersion.contentText ?? "",
  );
  const [file, setFile] = React.useState<File | null>(null);
  const request = useAgreementRequest();
  return (
    <form
      className="space-y-4 rounded-xl border border-border-subtle bg-surface p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void request.run(async (signal) => {
          await agreementsClient.publish(
            {
              title: title.trim(),
              contentText: content.trim(),
              originalPdf: file ? await readAgreementPdf(file) : null,
            },
            signal,
            document,
          );
          if (!signal.aborted) onPublished();
        });
      }}
    >
      <h3 className="font-semibold">
        {document
          ? `Publish version ${document.latestVersion.version + 1}`
          : "Publish a document"}
      </h3>
      <fieldset disabled={request.busy} className="min-w-0 space-y-4">
        <label className="block">
          Title
          <input
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block">
          Agreement text
          <textarea
            required
            maxLength={20000}
            rows={10}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block">
          Optional original PDF (maximum 2 MiB)
          <input
            type="file"
            accept=".pdf,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className={fieldClass}
          />
        </label>
        {document && (
          <p className="text-sm">
            Publishing makes all previous assignments historical, including
            accepted ones. Assign the new version explicitly. Attach a new
            original PDF if needed.
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Action type="submit" disabled={!title.trim() || !content.trim()}>
            Publish version
          </Action>
          <Action type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Action>
        </div>
      </fieldset>
      <Feedback {...request} />
    </form>
  );
}
