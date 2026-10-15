"use client";
import React from "react";
import Link from "next/link";
import { Button } from "@pathway/ui";
import type { ComplianceMedicalRecord } from "@pathway/types";
import { complianceMedicalClient } from "@/lib/compliance-medical-client";
import {
  hasUnavailableMedical,
  writableMedicalValues,
} from "@/lib/medical-read";
import { ApiError } from "@/lib/api-transport";
import {
  MedicalFields,
  MedicalSummary,
  type MedicalValues,
} from "./medical-fields";
function values(record: ComplianceMedicalRecord): MedicalValues {
  return {
    allergies: record.allergies,
    medicalConditions: record.medicalConditions,
    medicationAtSite: record.medicationAtSite,
  };
}
export function MedicalEditor({
  childId,
  canManage,
}: {
  childId: string;
  canManage: boolean;
}) {
  const [record, setRecord] = React.useState<ComplianceMedicalRecord | null>(
    null,
  );
  const [draft, setDraft] = React.useState<MedicalValues | null>(null);
  const [latest, setLatest] = React.useState<ComplianceMedicalRecord | null>(
    null,
  );
  const [busy, setBusy] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const unavailable = Boolean(
    (record && hasUnavailableMedical(record)) ||
    (draft && hasUnavailableMedical(draft)) ||
    (latest && hasUnavailableMedical(latest)),
  );
  const controller = React.useRef<AbortController | null>(null);
  const load = React.useCallback(
    async (comparison = false) => {
      controller.current?.abort();
      const current = new AbortController();
      controller.current = current;
      setBusy(true);
      setError(null);
      try {
        const result = await complianceMedicalClient.get(
          childId,
          current.signal,
        );
        if (!current.signal.aborted) {
          if (comparison) setLatest(result);
          else {
            setRecord(result);
            setDraft(values(result));
            setDirty(false);
          }
        }
      } catch {
        if (!current.signal.aborted)
          setError("Medical information could not be loaded. Please retry.");
      } finally {
        if (!current.signal.aborted) setBusy(false);
      }
    },
    [childId],
  );
  React.useEffect(() => {
    setRecord(null);
    setDraft(null);
    void load();
    return () => controller.current?.abort();
  }, [load]);
  async function save() {
    if (
      !record ||
      !draft ||
      !canManage ||
      conflict ||
      busy ||
      unavailable ||
      !writableMedicalValues(draft)
    )
      return;
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const result = await complianceMedicalClient.save(
        childId,
        { ...draft, expectedUpdatedAt: record.updatedAt },
        current.signal,
      );
      if (!current.signal.aborted) {
        setRecord(result);
        setDraft(values(result));
        setSaved(true);
        setDirty(false);
      }
    } catch (failure) {
      if (!current.signal.aborted) {
        const changed =
          failure instanceof ApiError &&
          (failure.status === 409 || failure.status === 503);
        const unreadable =
          failure instanceof ApiError && failure.status === 503;
        setConflict(changed);
        setError(
          unreadable
            ? "Medical information is temporarily unavailable. Your draft is preserved. Load the latest information before saving."
            : changed
              ? "This record changed elsewhere. Your draft is preserved. Load the latest information to compare before saving."
              : "Medical information could not be saved. Check the details and retry. Your draft is preserved.",
        );
      }
    } finally {
      if (!current.signal.aborted) setBusy(false);
    }
  }
  return (
    <div className="max-w-3xl space-y-5">
      <Link
        href="/compliance/medical"
        className="inline-flex min-h-11 items-center underline underline-offset-4"
      >
        Back to Medical Information
      </Link>
      <header>
        <h1 className="text-2xl font-semibold">
          Medical information
          {record ? `: ${record.firstName} ${record.lastName}` : ""}
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          Select “None” only after confirming there are no needs in that
          category. Leave unconfirmed information as unknown.
        </p>
      </header>
      {busy && (
        <p role="status">
          {record
            ? "Updating medical information…"
            : "Loading medical information…"}
        </p>
      )}
      {saved && <p role="status">Medical information saved.</p>}
      {error && (
        <div role="alert" className="space-y-3">
          <p>{error}</p>
          {(!record || conflict) && (
            <Button
              className="min-h-11 h-auto whitespace-normal py-2"
              variant="secondary"
              disabled={busy}
              onClick={() => void load(conflict)}
            >
              {conflict
                ? "Load latest information"
                : "Retry medical information"}
            </Button>
          )}
        </div>
      )}
      {unavailable && (
        <div role="alert" className="space-y-3">
          <p>
            Some medical information could not be read. Saving is blocked to
            protect the existing record. Retry; if it remains unavailable, ask
            an administrator to restore access. Do not treat unavailable
            information as no medical needs.
          </p>
          <Button
            className="min-h-11 h-auto whitespace-normal py-2"
            variant="secondary"
            disabled={busy}
            onClick={() => void load(conflict || Boolean(latest) || dirty)}
          >
            Retry unavailable information
          </Button>
        </div>
      )}
      {latest && (
        <section
          aria-label="Latest medical information"
          className="space-y-4 rounded-xl border border-border-subtle p-4"
        >
          <h2 className="font-semibold">Latest saved information</h2>
          <MedicalSummary value={latest} />
          <p className="text-sm">
            Your draft remains below. Compare it before choosing which
            information to keep.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              className="min-h-11 h-auto whitespace-normal py-2"
              disabled={busy || hasUnavailableMedical(latest)}
              variant="secondary"
              onClick={() => {
                setRecord(latest);
                setDraft(values(latest));
                setDirty(false);
                setLatest(null);
                setConflict(false);
                setError(null);
              }}
            >
              Discard draft and use latest
            </Button>
            <Button
              className="min-h-11 h-auto whitespace-normal py-2"
              disabled={busy || hasUnavailableMedical(latest)}
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
          </div>
        </section>
      )}
      {draft &&
        (canManage ? (
          <form
            className="space-y-5 rounded-xl border border-border-subtle bg-surface p-4 sm:p-6"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <MedicalFields
              value={draft}
              onChange={(value) => {
                setDraft(value);
                setDirty(true);
                setSaved(false);
              }}
              disabled={busy || unavailable}
            />
            <Button
              className="min-h-11 h-auto whitespace-normal py-2 text-text-primary"
              type="submit"
              disabled={busy || conflict || unavailable}
            >
              Save medical information
            </Button>
          </form>
        ) : (
          <MedicalSummary value={draft} />
        ))}
    </div>
  );
}
