"use client";

import React from "react";
import { Button, Card } from "@pathway/ui";
import {
  recordPhysicalSlipResponse,
  type SlipResponseSummary,
} from "@/lib/ace-trip-slips-api";
import { requestFailure } from "@/lib/request-error";

type Witness = { id: string; name: string };

export function ResponseSummary({
  siteId,
  slipId,
  summary,
  canManage,
  witnesses,
  onRecorded,
}: {
  siteId: string;
  slipId: string;
  summary: SlipResponseSummary;
  canManage: boolean;
  witnesses: Witness[];
  onRecorded: () => void;
}) {
  const [childId, setChildId] = React.useState("");
  const [decision, setDecision] = React.useState<"ACCEPTED" | "DECLINED">(
    "ACCEPTED",
  );
  const [source, setSource] = React.useState<"PHYSICAL" | "TELEPHONE">(
    "PHYSICAL",
  );
  const [reason, setReason] = React.useState("");
  const [witnessUserId, setWitnessUserId] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  async function record(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await recordPhysicalSlipResponse(siteId, slipId, {
        childId,
        expectedVersionId: summary.versionId,
        expectedVersionHash: summary.versionHash,
        decision,
        source,
        reason: reason.trim(),
        witnessUserId,
      });
      setChildId("");
      setReason("");
      setWitnessUserId("");
      onRecorded();
    } catch (cause) {
      setError(
        requestFailure(cause, "This response could not be recorded.").message,
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <Card
      title="Response dashboard"
      description="Counts follow the current published wording. A child counts as answered after any guardian response or witnessed exception."
    >
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt>Audience</dt>
          <dd className="text-xl font-semibold">{summary.audienceChildren}</dd>
        </div>
        <div>
          <dt>Answered children</dt>
          <dd className="text-xl font-semibold">
            {summary.childrenWithResponse}
          </dd>
        </div>
        <div>
          <dt>Awaiting response</dt>
          <dd className="text-xl font-semibold">
            {summary.childrenWithoutResponse}
          </dd>
        </div>
        <div>
          <dt>Witnessed exceptions</dt>
          <dd className="text-xl font-semibold">{summary.exceptions}</dd>
        </div>
      </dl>
      <div className="mt-5 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <caption className="sr-only">Response status by pupil</caption>
          <thead>
            <tr>
              <th scope="col" className="p-2">
                Pupil
              </th>
              <th scope="col" className="p-2">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {summary.rows.map((row) => (
              <tr key={row.childId} className="border-t border-border-subtle">
                <th scope="row" className="p-2 font-medium">
                  {row.childName}
                </th>
                <td className="p-2">
                  {row.exception
                    ? `Witnessed ${row.exception.decision.toLowerCase()}`
                    : row.responseCount
                      ? `${row.responseCount} guardian response${row.responseCount === 1 ? "" : "s"}`
                      : "Awaiting response"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canManage ? (
        <form
          onSubmit={(event) => void record(event)}
          className="mt-6 space-y-4 border-t border-border-subtle pt-5"
        >
          <h3 className="font-heading text-lg font-semibold text-text-primary">
            Record a witnessed response
          </h3>
          <p className="text-sm text-text-muted">
            Use this only after the school has received and retained the
            original paper or telephone evidence.
          </p>
          <label className="block text-sm font-semibold">
            Pupil
            <select
              required
              disabled={pending}
              value={childId}
              onChange={(event) => setChildId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-border-subtle bg-surface p-3"
            >
              <option value="">Choose a pupil</option>
              {summary.rows
                .filter((row) => !row.exception && !row.responseCount)
                .map((row) => (
                  <option key={row.childId} value={row.childId}>
                    {row.childName}
                  </option>
                ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold">
              Decision
              <select
                value={decision}
                disabled={pending}
                onChange={(event) =>
                  setDecision(event.target.value as typeof decision)
                }
                className="mt-1 w-full rounded-lg border border-border-subtle bg-surface p-3"
              >
                <option value="ACCEPTED">Accepted</option>
                <option value="DECLINED">Declined</option>
              </select>
            </label>
            <label className="block text-sm font-semibold">
              Source
              <select
                value={source}
                disabled={pending}
                onChange={(event) =>
                  setSource(event.target.value as typeof source)
                }
                className="mt-1 w-full rounded-lg border border-border-subtle bg-surface p-3"
              >
                <option value="PHYSICAL">Paper</option>
                <option value="TELEPHONE">Telephone</option>
              </select>
            </label>
          </div>
          <label className="block text-sm font-semibold">
            Evidence reference
            <textarea
              value={reason}
              required
              maxLength={2000}
              rows={3}
              disabled={pending}
              onChange={(event) => setReason(event.target.value)}
              className="mt-1 w-full rounded-lg border border-border-subtle bg-surface p-3"
            />
          </label>
          <label className="block text-sm font-semibold">
            Second staff witness
            <select
              value={witnessUserId}
              required
              disabled={pending}
              onChange={(event) => setWitnessUserId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-border-subtle bg-surface p-3"
            >
              <option value="">Choose a witness</option>
              {witnesses.map((witness) => (
                <option key={witness.id} value={witness.id}>
                  {witness.name}
                </option>
              ))}
            </select>
          </label>
          {error ? (
            <p role="alert" className="text-sm text-text-primary">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            disabled={pending || witnesses.length === 0}
            className="min-h-11"
          >
            {pending ? "Recording…" : "Record witnessed response"}
          </Button>
        </form>
      ) : null}
    </Card>
  );
}
