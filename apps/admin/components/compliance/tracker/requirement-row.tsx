"use client";
import React from "react";
import type {
  TrackerChecklistItem,
  TrackerAttestationStatus,
} from "@pathway/types";
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
  onConfirmed,
  guided = false,
}: {
  item: TrackerChecklistItem;
  profileVersion: number;
  canManage: boolean;
  onChange: () => void;
  onConfirmed?: (status: TrackerAttestationStatus) => void;
  guided?: boolean;
}): React.JSX.Element {
  const [open, setOpen] = React.useState(guided);
  const [evidenceOpen, setEvidenceOpen] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  React.useEffect(() => {
    if (guided) setOpen(true);
  }, [guided]);
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
      open={open}
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
        <div className={`${styles.body} space-y-5`}>
          <section className="space-y-2">
            <p>
              {item.applicability === "UNRESOLVED"
                ? r.unknownExplanation
                : r.applicabilityExplanation}
            </p>
            {item.applicability === "NOT_APPLICABLE" && (
              <p>
                {item.applicabilityReason ??
                  "This action does not match the recorded site facts."}{" "}
                Review the site profile and confirm with your local authority or
                relevant regulator before relying on this result.
              </p>
            )}
          </section>
          {canManage ? (
            <Confirmation
              item={item}
              profileVersion={profileVersion}
              onChange={(savedStatus) => {
                onChange();
                onConfirmed?.(savedStatus);
              }}
            />
          ) : (
            <p>Read-only access. {item.attestation?.notes}</p>
          )}
          <details className={styles.more}>
            <summary>Why this applies, expected evidence and sources</summary>
            <div className="space-y-2 pt-3">
              <p>
                {words(r.obligationClass)} · Version {r.version}
              </p>
              <h4 className="font-semibold">Expected evidence</h4>
              <ul className="list-disc space-y-1 pl-5">
                {r.expectedEvidence.map((text, index) => (
                  <li key={index}>{text}</li>
                ))}
              </ul>
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
            </div>
          </details>
          <details
            className={styles.more}
            onToggle={(event) => setEvidenceOpen(event.currentTarget.open)}
          >
            <summary>
              Supporting evidence · {item.evidenceCount} records
            </summary>
            {evidenceOpen && (
              <div className="pt-3">
                <EvidencePanel
                  requirement={r}
                  canManage={canManage && item.applicability === "APPLICABLE"}
                  onChange={onChange}
                />
              </div>
            )}
          </details>
          <details
            className={styles.more}
            onToggle={(event) => setHistoryOpen(event.currentTarget.open)}
          >
            <summary>Confirmation history</summary>
            {historyOpen && (
              <div className="pt-3">
                <History key={item.attestation?.revision ?? 0} id={r.id} />
              </div>
            )}
          </details>
        </div>
      )}
    </details>
  );
}
