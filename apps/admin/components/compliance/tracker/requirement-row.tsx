"use client";
import React from "react";
import type { TrackerChecklistItem } from "@pathway/types";
import { Check, ChevronDown, Circle, CircleHelp, Minus } from "lucide-react";
import { EvidencePanel } from "./evidence-panel";
import { Confirmation } from "./confirmation";
import { History } from "./history";
import { words } from "./profile-fields";
import styles from "./requirement-row.module.css";
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
}): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const r = item.requirement;
  const status =
    item.applicability === "NOT_APPLICABLE"
      ? "Not applicable"
      : item.applicability === "UNRESOLVED"
        ? "Unresolved"
        : item.attestation?.status === "NOT_APPLICABLE"
          ? "Recorded not applicable"
          : item.completed
            ? "Completed"
            : "To do";
  const StatusIcon =
    status === "Not applicable" || status === "Recorded not applicable"
      ? Minus
      : item.applicability === "UNRESOLVED"
        ? CircleHelp
        : item.completed
          ? Check
          : Circle;
  return (
    <details
      className={styles.row}
      data-status={status}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className={styles.summary}>
        <span className={styles.statusIcon} aria-hidden="true">
          <StatusIcon size={17} />
        </span>
        <span className={styles.content}>
          <span className={styles.action}>{r.action}</span>
          <span className={styles.metadata}>
            <span className={styles.status}>{status}</span>
            <span className={styles.obligation}>
              {words(r.obligationClass)}
            </span>
            {item.stale && <span>Confirmation needs renewal</span>}
            {item.overdue && <span>Review overdue</span>}
            {item.evidenceGap && <span>Evidence gap</span>}
          </span>
        </span>
        <ChevronDown className={styles.chevron} size={17} aria-hidden="true" />
      </summary>
      {open && (
        <div className={`${styles.body} space-y-6`}>
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
