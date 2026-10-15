"use client";
import React from "react";
import type { TrackerChecklistItem } from "@pathway/types";
import { EvidencePanel } from "./evidence-panel";
import { Confirmation } from "./confirmation";
import { History } from "./history";
import { words } from "./profile-fields";
export function RequirementRow({
  item,
  profileVersion,
  canManage,
  onChange,
}: {
  item: TrackerChecklistItem;
  profileVersion: number;
  canManage: boolean;
  onChange: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const r = item.requirement;
  return (
    <details
      className="rounded-xl border border-border-subtle bg-surface p-4 sm:p-5"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer break-words">
        <span className="font-semibold">{r.action}</span>
        <span className="mt-1 block text-sm text-text-muted">
          {item.completed ? "Completed" : words(item.applicability)}
          {item.stale ? " · Confirmation needs renewal" : ""}
          {item.overdue ? " · Review overdue" : ""}
          {item.evidenceGap ? " · Evidence gap" : ""}
        </span>
      </summary>
      {open && (
        <div className="mt-5 min-w-0 space-y-6">
          <section className="space-y-2">
            <p>
              {words(r.obligationClass)} · Version {r.version}
            </p>
            <p>
              {item.applicability === "UNRESOLVED"
                ? r.unknownExplanation
                : r.applicabilityExplanation}
            </p>
            <h4 className="font-semibold">Expected evidence</h4>
            <ul className="list-disc space-y-1 pl-5">
              {r.expectedEvidence.map((text, index) => (
                <li key={index}>{text}</li>
              ))}
            </ul>
            <p>{item.evidenceCount} supporting evidence record(s)</p>
            <h4 className="font-semibold">Authority and sources</h4>
            <ul className="space-y-2">
              {r.sources.map((source) => (
                <li key={source.id}>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="break-words underline"
                  >
                    {source.title}
                  </a>
                  <p className="text-sm text-text-muted">
                    {source.authority} · {source.provision}
                  </p>
                </li>
              ))}
            </ul>
          </section>
          {canManage ? (
            <Confirmation
              item={item}
              profileVersion={profileVersion}
              onChange={onChange}
            />
          ) : (
            <p>Read-only access. {item.attestation?.notes}</p>
          )}
          <EvidencePanel
            requirement={r}
            canManage={canManage && item.applicability === "APPLICABLE"}
            onChange={onChange}
          />
          <History key={item.attestation?.revision ?? 0} id={r.id} />
        </div>
      )}
    </details>
  );
}
