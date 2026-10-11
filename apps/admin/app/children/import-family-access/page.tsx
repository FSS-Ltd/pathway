"use client";

import * as React from "react";
import Link from "next/link";
import { Button, Card } from "@pathway/ui";
import { fetchChildren, type AdminChildRow } from "@/lib/api-client";
import { useAdminAccess } from "@/lib/use-admin-access";
import { subscribeToActiveSiteChanges } from "@/lib/active-site-events";
import {
  familyIdentityTemplate,
  parseFamilyIdentityCsv,
  type ParsedFamilyImportRow,
} from "@/lib/family-identity-import";
import { importFamilyIdentityRows } from "@/lib/family-identity-import-api";
import { ImportPreview } from "./import-preview";
import { ImportResults, type DisplayResult } from "./import-results";

export default function FamilyAccessImportPage() {
  const { role, isLoading: accessLoading } = useAdminAccess();
  const [children, setChildren] = React.useState<AdminChildRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [fileName, setFileName] = React.useState("");
  const [rows, setRows] = React.useState<ParsedFamilyImportRow[]>([]);
  const [validationErrors, setValidationErrors] = React.useState<string[]>([]);
  const [confirmed, setConfirmed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [results, setResults] = React.useState<DisplayResult[]>([]);
  const [revision, setRevision] = React.useState(0);
  const siteRevision = React.useRef(0);
  const fileRevision = React.useRef(0);

  React.useEffect(() => {
    const unsubscribe = subscribeToActiveSiteChanges(() => {
      siteRevision.current += 1;
      fileRevision.current += 1;
      setChildren([]);
      setRows([]);
      setFileName("");
      setValidationErrors([]);
      setConfirmed(false);
      setBusy(false);
      setError(null);
      setResults([]);
      setRevision((value) => value + 1);
    });
    return unsubscribe;
  }, []);

  React.useEffect(() => {
    if (accessLoading || !role?.isOrgAdmin) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    void fetchChildren()
      .then((value) => {
        if (active) setChildren(value);
      })
      .catch(() => {
        if (active)
          setError(
            "The current site roster could not be loaded. Retry before importing.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessLoading, role?.isOrgAdmin, revision]);

  function downloadTemplate() {
    const csv = familyIdentityTemplate(children);
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "family-access-invitations.csv";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function readFile(file: File | undefined) {
    const currentSite = siteRevision.current;
    const currentFile = ++fileRevision.current;
    setRows([]);
    setResults([]);
    setValidationErrors([]);
    setConfirmed(false);
    setFileName(file?.name ?? "");
    if (!file) return;
    if (file.size > 128_000) {
      setValidationErrors(["Use a CSV file smaller than 128 KB."]);
      return;
    }
    try {
      const content = await file.text();
      if (
        siteRevision.current !== currentSite ||
        fileRevision.current !== currentFile
      )
        return;
      const parsed = parseFamilyIdentityCsv(
        content,
        new Map(children.map((child) => [child.id, child.fullName])),
      );
      setRows(parsed.rows);
      setValidationErrors(parsed.errors);
    } catch (cause) {
      if (
        siteRevision.current !== currentSite ||
        fileRevision.current !== currentFile
      )
        return;
      setValidationErrors([
        cause instanceof Error ? cause.message : "The CSV could not be read.",
      ]);
    }
  }

  async function send() {
    if (busy || !confirmed || validationErrors.length || !rows.length) return;
    setBusy(true);
    setError(null);
    setResults([]);
    const currentSite = siteRevision.current;
    try {
      const completed: DisplayResult[] = [];
      for (let offset = 0; offset < rows.length; offset += 10) {
        if (siteRevision.current !== currentSite) return;
        const batch = rows.slice(offset, offset + 10);
        const outcomes = await importFamilyIdentityRows(
          batch.map(({ row }) => row),
        );
        if (siteRevision.current !== currentSite) return;
        completed.push(
          ...outcomes.map((outcome) => ({
            ...outcome,
            csvRow: batch[outcome.rowNumber - 1].csvRow,
          })),
        );
        setResults([...completed]);
      }
    } catch (cause) {
      if (siteRevision.current !== currentSite) return;
      setError(
        cause instanceof Error
          ? `${cause.message} Earlier rows may have been saved. Upload the same file to resume.`
          : "The import stopped. Earlier rows may have been saved. Upload the same file to resume.",
      );
    } finally {
      if (siteRevision.current === currentSite) {
        setBusy(false);
        setConfirmed(false);
      }
    }
  }

  if (accessLoading || loading) {
    return (
      <p role="status" className="text-sm text-text-muted">
        Loading the current site roster…
      </p>
    );
  }
  if (!role?.isOrgAdmin) {
    return (
      <Card
        title="Family access import"
        description="Organisation admin access is required."
      />
    );
  }

  const childNames = new Map(
    children.map((child) => [child.id, child.fullName]),
  );
  return (
    <div className="space-y-5">
      <div>
        <Link href="/children" className="text-sm text-text-muted underline">
          Back to children
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-semibold text-text-primary">
          Import family invitations
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-text-muted">
          Invite guardians and students for children at the current site. Nobody
          gets family access until they sign in with the invited, verified email
          and accept.
        </p>
      </div>

      <Card
        title="1. Prepare the file"
        description="Download the current site roster, fill one invitation per row, and remove any rows you do not need."
      >
        <div className="mt-4 space-y-3 text-sm text-text-muted">
          <p>
            Keep childId and childName together and unchanged. For guardians,
            enter GUARDIAN and SCHOOL_RECORDS or LEGAL_DOCUMENT. For ACE school
            students, enter STUDENT and leave reviewBasis blank. Enter yes in
            confirmed for each person after checking legal access or the
            school’s age, consent, and safeguarding approval.
          </p>
          <Button
            type="button"
            variant="secondary"
            disabled={Boolean(error) || children.length === 0}
            onClick={downloadTemplate}
          >
            Download CSV template
          </Button>
          {children.length === 0 && !error ? (
            <p>No children are in this site roster yet.</p>
          ) : null}
        </div>
      </Card>

      <ImportPreview
        fileName={fileName}
        rows={rows}
        childNames={childNames}
        validationErrors={validationErrors}
        busy={busy}
        disabled={Boolean(error)}
        confirmed={confirmed}
        onFile={(file) => void readFile(file)}
        onConfirm={setConfirmed}
        onSend={() => void send()}
      />

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-status-danger p-3 text-sm text-status-danger"
        >
          {error}{" "}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setError(null);
              if (!children.length) setRevision((value) => value + 1);
            }}
          >
            Retry
          </Button>
        </div>
      ) : null}
      <ImportResults results={results} />
    </div>
  );
}
