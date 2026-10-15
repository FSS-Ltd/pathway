"use client";
import React from "react";
import { trackerClient } from "@/lib/tracker-client";
import { Action, Feedback } from "../agreements/shared";
import { useAgreementPage } from "../agreements/use-agreement-page";
import { words } from "./profile-fields";
export function History({ id }: { id: string }) {
  const load = React.useCallback(
    (signal: AbortSignal, cursor?: string) =>
      trackerClient.history(id, signal, cursor),
    [id],
  );
  const page = useAgreementPage(load);
  return (
    <section className="space-y-3">
      <h4 className="font-semibold">Confirmation history</h4>
      <Feedback busy={page.busy} error={page.error} success="" />
      {page.error && (
        <Action onClick={() => void page.refresh()}>Retry history</Action>
      )}
      {!page.busy && !page.error && !page.items.length && (
        <p>No manual confirmations yet.</p>
      )}
      {page.items.map((value) => (
        <article key={value.id} className="border-b border-border-subtle py-3">
          <p className="font-medium break-words">{value.requirement.action}</p>
          <p>
            {words(value.status)} · {new Date(value.createdAt).toLocaleString()}
          </p>
          <p className="text-sm text-text-muted">
            Requirement v{value.requirementVersion} · Profile v
            {value.profileVersion} · Confirmation revision {value.revision}
          </p>
          <p className="whitespace-pre-wrap break-words">{value.notes}</p>
          {value.notApplicableReason && (
            <p className="break-words">
              Not applicable reason: {value.notApplicableReason}
            </p>
          )}
          {value.reviewDueAt && (
            <p>Review due: {value.reviewDueAt.slice(0, 10)}</p>
          )}
        </article>
      ))}
      {page.cursor && (
        <Action
          disabled={page.busy}
          onClick={() => void page.refresh(page.cursor ?? undefined)}
        >
          Load more history
        </Action>
      )}
    </section>
  );
}
