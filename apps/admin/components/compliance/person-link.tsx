"use client";
import React from "react";
import { Button } from "@pathway/ui";
import type {
  CompliancePeoplePage,
  ComplianceRecordInput,
} from "@pathway/types";
import { complianceClient } from "@/lib/compliance-client";
import { fieldClass } from "./record-fields";
export function PersonLink({
  value,
  onChange,
}: {
  value: ComplianceRecordInput;
  onChange: (value: ComplianceRecordInput) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState<CompliancePeoplePage | null>(null);
  const [error, setError] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const controller = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => controller.current?.abort(), []);
  async function search() {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setError(false);
    setPage(null);
    try {
      const result = await complianceClient.people(query, current.signal);
      if (!current.signal.aborted) setPage(result);
    } catch {
      if (!current.signal.aborted) setError(true);
    } finally {
      if (!current.signal.aborted) setBusy(false);
    }
  }
  return (
    <details className="rounded-lg border border-border-subtle p-3">
      <summary className="cursor-pointer text-sm font-medium">
        {value.subjectUserId
          ? "Portal account linked (optional)"
          : "Link a portal account (optional)"}
      </summary>
      <div className="mt-3 space-y-3">
        {value.subjectUserId && (
          <Button
            className="min-h-11 h-auto whitespace-normal py-2"
            type="button"
            variant="secondary"
            onClick={() => onChange({ ...value, subjectUserId: null })}
          >
            Remove account link
          </Button>
        )}
        <label className="block text-sm">
          Search people by name
          <input
            className={fieldClass}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={100}
          />
        </label>
        <Button
          className="min-h-11 h-auto whitespace-normal py-2"
          type="button"
          variant="secondary"
          disabled={busy || query.trim().length < 2}
          onClick={() => void search()}
        >
          {busy ? "Searching…" : "Search people"}
        </Button>
        {error && (
          <p role="alert">People could not be loaded. Retry the search.</p>
        )}
        {page && (
          <ul className="space-y-2">
            {page.items.map((person) => (
              <li key={person.id}>
                <Button
                  className="min-h-11 h-auto whitespace-normal py-2"
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    onChange({
                      ...value,
                      subjectUserId: person.id,
                      subjectName: person.name,
                    });
                    setPage(null);
                  }}
                >
                  {person.name}
                </Button>
              </li>
            ))}
            {page.items.length === 0 && <li>No matching people.</li>}
          </ul>
        )}
      </div>
    </details>
  );
}
