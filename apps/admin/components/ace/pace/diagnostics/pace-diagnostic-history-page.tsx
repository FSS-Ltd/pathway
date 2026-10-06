"use client";

import React from "react";
import Link from "next/link";
import { NoAccessCard } from "@/components/no-access-card";
import { subscribeToActiveSiteChanges } from "@/lib/active-site-events";
import { useSitePagedResults } from "@/components/ace/pace/use-site-paged-results";
import { PaceDiagnosticHistory } from "./pace-diagnostic-history";
import { PaceDiagnosticRecordForm } from "./pace-diagnostic-record-form";
import {
  fetchPaceDiagnosticHistory,
  recordPaceDiagnostic,
  retractPaceDiagnostic,
  type PaceDiagnosticPage,
} from "@/lib/pace-diagnostic-api";
import { useAdminAccess } from "@/lib/use-admin-access";
import { useSession } from "@/lib/use-session-compat";

const uuidPattern = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;

export function PaceDiagnosticHistoryPage({
  childId,
  subjectId,
}: {
  childId: string | null;
  subjectId: string | null;
}) {
  const { status: sessionStatus } = useSession();
  const { permissions, isLoading: isLoadingAccess } = useAdminAccess();
  const canRead = permissions?.includes("ace.pace.diagnostics.read") === true;
  const canManage =
    permissions?.includes("ace.pace.diagnostics.manage") === true;
  const [includeRetracted, setIncludeRetracted] = React.useState(false);
  const [selectionValidForSite, setSelectionValidForSite] =
    React.useState(true);
  React.useEffect(
    () => subscribeToActiveSiteChanges(() => setSelectionValidForSite(false)),
    [],
  );
  const selected =
    childId !== null &&
    subjectId !== null &&
    uuidPattern.test(childId) &&
    uuidPattern.test(subjectId) &&
    selectionValidForSite;

  if (isLoadingAccess || sessionStatus === "loading") {
    return <p role="status">Loading diagnostic access…</p>;
  }
  if (sessionStatus !== "authenticated" || !canRead) {
    return (
      <NoAccessCard
        title="PACE diagnostics"
        message="You do not have permission to view PACE diagnostic results."
      />
    );
  }

  return (
    <main className="mx-auto flex min-w-0 max-w-4xl flex-col gap-5">
      <header className="space-y-2">
        <Link
          href="/ace/pace"
          className="inline-flex min-h-11 items-center text-sm font-medium text-accent-strong underline-offset-4 hover:underline focus-visible:underline"
        >
          Back to PACE roster
        </Link>
        <h1 className="font-heading text-2xl font-semibold text-text-primary sm:text-3xl">
          Diagnostic history
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-text-muted">
          Recording a diagnostic does not change the assigned PACE.
        </p>
      </header>
      {selected && childId && subjectId ? (
        <SelectedDiagnosticHistory
          key={`${childId}:${subjectId}`}
          childId={childId}
          subjectId={subjectId}
          canManage={canManage}
          includeRetracted={includeRetracted}
          onIncludeRetractedChange={setIncludeRetracted}
        />
      ) : (
        <p className="rounded-xl border border-border-subtle p-5 text-sm leading-6 text-text-muted">
          Choose a child and subject from the PACE roster to view diagnostic
          results.
        </p>
      )}
    </main>
  );
}

function SelectedDiagnosticHistory({
  childId,
  subjectId,
  canManage,
  includeRetracted,
  onIncludeRetractedChange,
}: {
  childId: string;
  subjectId: string;
  canManage: boolean;
  includeRetracted: boolean;
  onIncludeRetractedChange: (value: boolean) => void;
}) {
  const [selection, setSelection] = React.useState<
    PaceDiagnosticPage["selection"] | null
  >(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const fetchPage = React.useCallback(
    async ({ cursor, signal }: { cursor?: string; signal?: AbortSignal }) => {
      const page = await fetchPaceDiagnosticHistory({
        childId,
        subjectId,
        includeRetracted,
        cursor,
        signal,
      });
      if (!signal?.aborted) setSelection(page.selection);
      return page;
    },
    [childId, subjectId, includeRetracted],
  );
  const history = useSitePagedResults(
    fetchPage,
    true,
    "Unable to load diagnostic history.",
  );
  return (
    <div className="space-y-4">
      {selection ? (
        <>
          <p className="text-sm font-medium text-text-primary">
            {selection.child.displayName} · {selection.subject.name}
          </p>
          {canManage ? (
            <PaceDiagnosticRecordForm
              childId={childId}
              subjectId={subjectId}
              childName={selection.child.displayName}
              subjectName={selection.subject.name}
              onRecord={recordPaceDiagnostic}
              onRecorded={history.retry}
            />
          ) : null}
        </>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="rounded-lg bg-status-ok/10 px-4 py-3 text-sm text-status-ok"
        >
          {notice}
        </p>
      ) : null}
      <PaceDiagnosticHistory
        history={history}
        includeRetracted={includeRetracted}
        onIncludeRetractedChange={onIncludeRetractedChange}
        retraction={
          canManage
            ? {
                onRetract: (resultId, reason) =>
                  retractPaceDiagnostic(resultId, { reason }),
                onRetracted: () => {
                  setNotice(
                    "Diagnostic retracted. The original result remains in history.",
                  );
                  history.retry();
                },
              }
            : undefined
        }
      />
    </div>
  );
}
