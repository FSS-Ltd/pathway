"use client";
import React from "react";
import { Button } from "@pathway/ui";
import type {
  ComplianceRecordInput,
  CompliancePersonnelRecord,
} from "@pathway/types";
import { complianceClient } from "@/lib/compliance-client";
import { ApiError } from "@/lib/api-transport";
import { RecordFields } from "./record-fields";
import { PersonLink } from "./person-link";
import { RecordHistory } from "./record-history";
const EMPTY: ComplianceRecordInput = {
  subjectName: "",
  subjectUserId: null,
  roleDescription: "",
  kind: "BACKGROUND_CHECK",
  scheme: null,
  title: "",
  provider: null,
  reference: null,
  completedOn: null,
  reviewDueOn: null,
  status: "PENDING",
  notes: null,
  verificationNotes: null,
};
function editable(record: ComplianceRecordInput): ComplianceRecordInput {
  return {
    subjectName: record.subjectName,
    subjectUserId: record.subjectUserId,
    roleDescription: record.roleDescription,
    kind: record.kind,
    scheme: record.scheme,
    title: record.title,
    provider: record.provider,
    reference: record.reference,
    completedOn: record.completedOn,
    reviewDueOn: record.reviewDueOn,
    status: record.status,
    notes: record.notes,
    verificationNotes: record.verificationNotes,
  };
}
export function RecordEditor({
  initial,
  canManage,
  onClose,
  onSaved,
}: {
  initial: CompliancePersonnelRecord | null;
  canManage: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [record, setRecord] = React.useState(initial);
  const [draft, setDraft] = React.useState(() => editable(initial ?? EMPTY));
  const [latest, setLatest] = React.useState<CompliancePersonnelRecord | null>(
    null,
  );
  const [saved, setSaved] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState(false);
  const [archiveConfirm, setArchiveConfirm] = React.useState(false);
  const controller = React.useRef(new AbortController());
  const heading = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => {
    heading.current?.focus();
    const current = new AbortController();
    controller.current = current;
    return () => current.abort();
  }, []);
  async function perform(action: "save" | "archive" | "reload") {
    setSaved(false);
    setBusy(true);
    setError(null);
    const signal = controller.current.signal;
    try {
      if (action === "reload" && record) {
        const result = await complianceClient.get(record.id, signal);
        if (!signal.aborted) setLatest(result);
      } else {
        const result =
          action === "archive" && record
            ? await complianceClient.archive(record, signal)
            : await complianceClient.save(draft, signal, record ?? undefined);
        if (!signal.aborted) {
          setSaved(true);
          setRecord(result);
          setDraft(editable(result));
          setConflict(false);
          setArchiveConfirm(false);
          onSaved();
        }
      }
    } catch (failure) {
      if (!signal.aborted) {
        if (action !== "reload")
          setConflict(failure instanceof ApiError && failure.status === 409);
        setError(
          failure instanceof ApiError && failure.status === 409
            ? "This record changed elsewhere. Your draft is preserved. Load the latest version before deciding what to keep."
            : failure instanceof ApiError && failure.status === 400
              ? "Check the required fields, dates and verification details. No changes were saved; your draft is preserved."
              : "The request failed. Your draft is preserved. Please retry.",
        );
      }
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }
  const readOnly = !canManage || Boolean(record?.archivedAt);
  return (
    <section
      className="space-y-5 rounded-2xl border border-border-subtle bg-surface p-4 sm:p-6"
      aria-labelledby="record-editor-heading"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2
            ref={heading}
            tabIndex={-1}
            id="record-editor-heading"
            className="text-lg font-semibold"
          >
            {record ? "Record details" : "Add a record"}
          </h2>
          <p className="text-sm text-text-muted">
            {record?.archivedAt
              ? "Archived · history retained"
              : record
                ? `Version ${record.version}`
                : "Required fields are marked *"}
          </p>
        </div>
        <Button
          className="min-h-11 h-auto whitespace-normal py-2"
          variant="secondary"
          disabled={busy}
          onClick={onClose}
        >
          Close
        </Button>
      </div>
      {saved && <p role="status">Record saved.</p>}
      {error && (
        <div
          role="alert"
          className="space-y-3 rounded-lg border border-border-subtle p-3"
        >
          <p>{error}</p>
          {conflict && (
            <Button
              className="min-h-11 h-auto whitespace-normal py-2"
              variant="secondary"
              disabled={busy}
              onClick={() => void perform("reload")}
            >
              Load latest version
            </Button>
          )}
        </div>
      )}
      {latest && (
        <div className="space-y-3 rounded-lg border border-border-subtle p-3">
          <h3 className="font-semibold">Latest: version {latest.version}</h3>
          <p>
            {latest.title} · {latest.subjectName} ·{" "}
            {latest.status.toLowerCase()}
          </p>
          <RecordFields
            value={editable(latest)}
            onChange={() => undefined}
            disabled
          />
          <p>
            Your draft remains in the form below. Review the latest record
            before replacing it.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              className="min-h-11 h-auto whitespace-normal py-2"
              variant="secondary"
              onClick={() => {
                setRecord(latest);
                setDraft(editable(latest));
                setLatest(null);
                setConflict(false);
                setError(null);
              }}
            >
              Discard draft and use latest
            </Button>
            {!latest.archivedAt && (
              <Button
                className="min-h-11 h-auto whitespace-normal py-2"
                variant="secondary"
                onClick={() => {
                  setRecord(latest);
                  setLatest(null);
                  setConflict(false);
                  setError(null);
                }}
              >
                Keep draft against latest version
              </Button>
            )}
          </div>
        </div>
      )}
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!readOnly && !conflict) void perform("save");
        }}
      >
        <RecordFields
          value={draft}
          onChange={setDraft}
          disabled={busy || readOnly}
        />
        {!readOnly && (
          <fieldset disabled={busy}>
            <PersonLink value={draft} onChange={setDraft} />
          </fieldset>
        )}
        {!readOnly && (
          <Button
            className="min-h-11 h-auto whitespace-normal py-2 text-text-primary"
            type="submit"
            disabled={busy || conflict}
          >
            {busy
              ? "Saving…"
              : draft.status === "VERIFIED"
                ? "Save and verify"
                : "Save record"}
          </Button>
        )}
      </form>
      {record?.verifiedAt && (
        <p className="text-sm text-text-muted">
          Verified {new Date(record.verifiedAt).toLocaleString()} ·{" "}
          {record.verifiedByUserId}
        </p>
      )}
      {record && <RecordHistory id={record.id} version={record.version} />}
      {record && !readOnly && (
        <div className="border-t border-border-subtle pt-4">
          {archiveConfirm ? (
            <div className="space-y-3">
              <p>
                Archive this record? It will leave the active register; its
                history will remain available.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="min-h-11 h-auto whitespace-normal py-2 text-text-primary"
                  disabled={busy || conflict}
                  onClick={() => void perform("archive")}
                >
                  Confirm archive
                </Button>
                <Button
                  className="min-h-11 h-auto whitespace-normal py-2"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setArchiveConfirm(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              className="min-h-11 h-auto whitespace-normal py-2"
              variant="secondary"
              disabled={busy}
              onClick={() => setArchiveConfirm(true)}
            >
              Archive record
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
