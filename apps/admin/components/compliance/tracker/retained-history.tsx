"use client";
import React from "react";
import { trackerClient } from "@/lib/tracker-client";
import { Action, Feedback } from "../agreements/shared";
import { useAgreementPage } from "../agreements/use-agreement-page";
import { History } from "./history";
import { EvidencePanel } from "./evidence-panel";
export function RetainedHistory() {
  const page = useAgreementPage(trackerClient.retained);
  const [selected, setSelected] = React.useState<string | null>(null);
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Retained history</h2>
      <p className="text-sm text-text-muted">
        Previous confirmations and evidence remain available when a profile
        changes or a requirement is withdrawn. These records do not count as
        current completion.
      </p>
      <Action
        variant="secondary"
        disabled={page.busy}
        onClick={() => void page.refresh()}
      >
        Refresh retained history
      </Action>
      <Feedback busy={page.busy} error={page.error} success="" />
      {page.error && (
        <Action disabled={page.busy} onClick={() => void page.refresh()}>
          Retry retained history
        </Action>
      )}
      {!page.busy && !page.error && !page.items.length && (
        <p>No historical confirmations or evidence have been recorded.</p>
      )}
      {page.items.map((value) => (
        <article
          key={value.requirementId}
          className="space-y-4 rounded-xl border border-border-subtle bg-surface p-4"
        >
          <h3 className="break-words font-semibold">
            {value.action ?? `Requirement ${value.requirementId}`}
          </h3>
          <p className="text-sm text-text-muted">
            Latest retained requirement version {value.requirementVersion}
          </p>
          <Action
            variant="secondary"
            aria-expanded={selected === value.requirementId}
            onClick={() =>
              setSelected(
                selected === value.requirementId ? null : value.requirementId,
              )
            }
          >
            {selected === value.requirementId
              ? "Close retained record"
              : "Open retained record"}
          </Action>
          {selected === value.requirementId && (
            <div className="space-y-6">
              <History id={value.requirementId} />
              <EvidencePanel
                requirement={{
                  id: value.requirementId,
                  version: value.requirementVersion,
                }}
                canManage={false}
                onChange={() => void page.refresh()}
              />
            </div>
          )}
        </article>
      ))}
      {page.cursor && (
        <Action
          disabled={page.busy}
          onClick={() => void page.refresh(page.cursor ?? undefined)}
        >
          Load more retained records
        </Action>
      )}
    </section>
  );
}
