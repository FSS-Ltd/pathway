import React from "react";
import type { TrackerProgress } from "@pathway/types";
import styles from "./completion-overview.module.css";

interface CompletionOverviewProps {
  progress: TrackerProgress;
  coverageGaps: number;
  observedAt: string;
}

export function CompletionOverview({
  progress,
  coverageGaps,
  observedAt,
}: CompletionOverviewProps): React.JSX.Element {
  const hasApplicableActions = progress.applicable > 0;
  const percentage = hasApplicableActions
    ? Math.round((progress.completed / progress.applicable) * 100)
    : 0;
  const metrics = [
    ["Unresolved applicability", progress.unresolved],
    ["Coverage gaps", coverageGaps],
    ["Overdue reviews", progress.overdue],
    ["Confirmations needing renewal", progress.stale],
    ["Evidence gaps", progress.evidenceGaps],
    ["Not applicable decisions", progress.notApplicable],
  ] as const;

  return (
    <section className={styles.overview} aria-label="Checklist completion">
      <div className={styles.summary}>
        <div className={styles.heading}>
          <h2 className={styles.title}>Checklist completion</h2>
          {hasApplicableActions ? (
            <p className={styles.completion}>
              <span className={styles.count}>{progress.completed}</span>{" "}
              <span className={styles.total}>of {progress.applicable}</span>{" "}
              <span className={styles.caption}>
                applicable actions completed
              </span>
            </p>
          ) : (
            <p className={styles.empty}>No applicable items</p>
          )}
        </div>
        {hasApplicableActions && (
          <p className={styles.percentage}>
            <strong>{percentage}%</strong>
            <span>complete</span>
          </p>
        )}
      </div>

      {hasApplicableActions && (
        <>
          <progress
            className={styles.accessibleProgress}
            aria-label="Checklist completion"
            value={progress.completed}
            max={progress.applicable}
          />
          <div className={styles.rail} aria-hidden="true">
            <div className={styles.fill} style={{ width: `${percentage}%` }} />
          </div>
        </>
      )}

      <dl className={styles.metrics}>
        {metrics.map(([label, count]) => (
          <div key={label} className={styles.metric}>
            <dt>{label}</dt>
            <dd>{count}</dd>
          </div>
        ))}
      </dl>
      <p className={styles.observed}>
        Manual confirmations. Checklist completion is not legal certification.
      </p>
      <p className={styles.observed}>
        Observed{" "}
        <time dateTime={observedAt}>
          {new Date(observedAt).toLocaleString()}
        </time>
      </p>
    </section>
  );
}
