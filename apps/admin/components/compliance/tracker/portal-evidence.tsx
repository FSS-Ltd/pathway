import React from "react";
import { ArrowUpRight, Link2 } from "lucide-react";
import type { TrackerSignal } from "@pathway/types";
import { words } from "./profile-fields";
import styles from "./workspace.module.css";

export function PortalEvidence({
  signals,
  error,
}: {
  signals: TrackerSignal[];
  error: string;
}): React.JSX.Element {
  return (
    <section className={styles.supportCard}>
      <div className={styles.supportHeading}>
        <Link2 size={18} aria-hidden="true" />
        <h2>Live portal evidence</h2>
      </div>
      <p className={styles.supportDescription}>
        Connected records support your review. They never complete an action
        automatically.
      </p>
      {error && <p role="alert">{error}</p>}
      {!error && !signals.length && (
        <p className={styles.supportDescription}>
          No live signals are available for this view. Evidence status is
          unknown.
        </p>
      )}
      <ul className={styles.signalList}>
        {signals.map((signal) => (
          <li key={signal.key}>
            <h3>
              {words(signal.key)} ·{" "}
              {signal.status === "UNKNOWN"
                ? "Unknown"
                : `${signal.count ?? 0} recorded`}
            </h3>
            <p>{signal.description}</p>
            {signal.missingCount !== null && (
              <p>{signal.missingCount} missing information</p>
            )}
            <small>
              Observed {new Date(signal.observedAt).toLocaleString()}
            </small>
            {signal.href && (
              <a href={signal.href}>
                View {words(signal.key).toLowerCase()} records{" "}
                <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
