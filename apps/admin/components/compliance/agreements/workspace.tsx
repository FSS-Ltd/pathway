"use client";
import React from "react";
import { agreementsClient } from "@/lib/agreements-client";
import { Action, Feedback } from "./shared";
import { useAgreementPage } from "./use-agreement-page";
import { AssignmentCard } from "./assignment-card";
import { DocumentPanel } from "./document-panel";
import { PublishForm } from "./publish-form";
function MyAgreements() {
  const page = useAgreementPage(agreementsClient.mine);
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">My agreements</h2>
      <Action
        variant="secondary"
        disabled={page.busy}
        onClick={() => void page.refresh()}
      >
        Refresh my agreements
      </Action>
      <Feedback busy={page.busy} error={page.error} success="" />
      {page.error && (
        <Action onClick={() => void page.refresh()}>Retry my agreements</Action>
      )}
      {!page.busy && !page.error && !page.items.length && (
        <p>No agreements have been assigned to you at this site.</p>
      )}
      {page.items.map((value) => (
        <AssignmentCard
          key={value.id}
          value={value}
          own
          canManage={false}
          onChange={(next) =>
            page.setItems((previous) =>
              previous.map((item) => (item.id === next.id ? next : item)),
            )
          }
        />
      ))}
      {page.cursor && (
        <Action
          disabled={page.busy}
          onClick={() => void page.refresh(page.cursor ?? undefined)}
        >
          Load more of my agreements
        </Action>
      )}
    </section>
  );
}
function AgreementManagement({ canManage }: { canManage: boolean }) {
  const page = useAgreementPage(agreementsClient.documents);
  const [creating, setCreating] = React.useState(false);
  const [selected, setSelected] = React.useState<string | null>(null);
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Document register</h2>
        <Action
          variant="secondary"
          disabled={page.busy}
          onClick={() => void page.refresh()}
        >
          Refresh documents
        </Action>
        {canManage && !creating && (
          <Action onClick={() => setCreating(true)}>Publish a document</Action>
        )}
      </div>
      {creating && (
        <PublishForm
          onCancel={() => setCreating(false)}
          onPublished={() => {
            setCreating(false);
            void page.refresh();
          }}
        />
      )}
      <Feedback busy={page.busy} error={page.error} success="" />
      {page.error && (
        <Action onClick={() => void page.refresh()}>Retry documents</Action>
      )}
      {!page.busy && !page.error && !page.items.length && (
        <p>No documents have been published at this site.</p>
      )}
      {page.items.map((document) => (
        <article
          className="space-y-4 rounded-xl border border-border-subtle bg-surface p-4 sm:p-5"
          key={document.id}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="break-words font-semibold">
                {document.latestVersion.title}
              </h3>
              <p className="text-sm text-text-muted">
                Current version {document.latestVersion.version}
              </p>
            </div>
            <Action
              variant="secondary"
              aria-expanded={selected === document.id}
              onClick={() =>
                setSelected(selected === document.id ? null : document.id)
              }
            >
              {selected === document.id ? "Close document" : "Open document"}
            </Action>
          </div>
          {selected === document.id && (
            <DocumentPanel
              key={document.latestVersion.id}
              document={document}
              canManage={canManage}
              onPublished={() => void page.refresh()}
            />
          )}
        </article>
      ))}
      {page.cursor && (
        <Action
          disabled={page.busy}
          onClick={() => void page.refresh(page.cursor ?? undefined)}
        >
          Load more documents
        </Action>
      )}
    </section>
  );
}
export function AgreementsWorkspace({
  canRead,
  canManage,
}: {
  canRead: boolean;
  canManage: boolean;
}) {
  return (
    <div className="space-y-8">
      <header className="max-w-2xl">
        <h1 className="text-2xl font-semibold">User Agreements</h1>
        <p className="mt-2 text-sm text-text-muted">
          Review assigned documents and keep a record of acknowledgements and
          signed copies. Guardian consents and trip permissions are managed
          separately.
        </p>
      </header>
      <MyAgreements />
      {canRead && <AgreementManagement canManage={canManage} />}
    </div>
  );
}
