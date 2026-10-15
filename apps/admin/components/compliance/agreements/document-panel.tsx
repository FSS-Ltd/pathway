"use client";
import React from "react";
import type { AgreementDocument } from "@pathway/types";
import { agreementsClient, downloadAgreement } from "@/lib/agreements-client";
import { Action, Feedback, useAgreementRequest } from "./shared";
import { useAgreementPage } from "./use-agreement-page";
import { AssignmentCard } from "./assignment-card";
import { AssignForm } from "./assign-form";
import { PublishForm } from "./publish-form";
export function DocumentPanel({
  document,
  canManage,
  onPublished,
}: {
  document: AgreementDocument;
  canManage: boolean;
  onPublished: () => void;
}) {
  const load = React.useCallback(
    (signal: AbortSignal, cursor?: string) =>
      agreementsClient.assignments(document.id, signal, cursor),
    [document.id],
  );
  const assignments = useAgreementPage(load);
  const loadVersions = React.useCallback(
    (signal: AbortSignal, cursor?: string) =>
      agreementsClient.versions(document.id, signal, cursor),
    [document.id],
  );
  const versions = useAgreementPage(loadVersions);
  const download = useAgreementRequest();
  const [publishing, setPublishing] = React.useState(false);
  return (
    <section className="space-y-5 border-t border-border-subtle pt-4">
      {canManage && (
        <>
          {publishing ? (
            <PublishForm
              document={document}
              onCancel={() => setPublishing(false)}
              onPublished={onPublished}
            />
          ) : (
            <Action onClick={() => setPublishing(true)}>
              Publish a new version
            </Action>
          )}
          <AssignForm
            versionId={document.latestVersion.id}
            onAssigned={() => void assignments.refresh()}
          />
        </>
      )}
      <h4 className="font-semibold">Published versions</h4>
      <Feedback busy={versions.busy} error={versions.error} success="" />
      {versions.error && (
        <Action onClick={() => void versions.refresh()}>Retry versions</Action>
      )}
      {versions.items.map((version) => (
        <details
          key={version.id}
          className="rounded-lg border border-border-subtle p-3"
        >
          <summary className="min-h-11 cursor-pointer py-2 break-words">
            Version {version.version} · {version.title}
          </summary>
          <p className="whitespace-pre-wrap break-words py-3">
            {version.contentText}
          </p>
          {version.hasOriginalFile && (
            <Action
              variant="secondary"
              disabled={download.busy}
              onClick={() =>
                void download.run((signal) =>
                  downloadAgreement(
                    `/versions/${encodeURIComponent(version.id)}/file`,
                    signal,
                  ),
                )
              }
            >
              Download version {version.version} PDF
            </Action>
          )}
        </details>
      ))}
      {versions.cursor && (
        <Action
          disabled={versions.busy}
          onClick={() => void versions.refresh(versions.cursor ?? undefined)}
        >
          Load older versions
        </Action>
      )}
      <Feedback {...download} />
      <h4 className="font-semibold">Assignments and acceptance history</h4>
      <Feedback busy={assignments.busy} error={assignments.error} success="" />
      {assignments.error && (
        <Action onClick={() => void assignments.refresh()}>
          Retry assignments
        </Action>
      )}
      {!assignments.busy && !assignments.error && !assignments.items.length && (
        <p>No assignments yet.</p>
      )}
      {assignments.items.map((assignment) => (
        <AssignmentCard
          key={assignment.id}
          value={assignment}
          own={false}
          canManage={canManage}
          onChange={(next) =>
            assignments.setItems((previous) =>
              previous.map((item) => (item.id === next.id ? next : item)),
            )
          }
        />
      ))}
      {assignments.cursor && (
        <Action
          disabled={assignments.busy}
          onClick={() =>
            void assignments.refresh(assignments.cursor ?? undefined)
          }
        >
          Load more assignments
        </Action>
      )}
    </section>
  );
}
