import React from "react";
import { AlertCircle, ChevronDown } from "lucide-react";
import type { TrackerCoverage } from "@pathway/types";
import { words } from "./profile-fields";
import styles from "./workspace.module.css";

export function CoverageNotice({
  coverage,
}: {
  coverage: TrackerCoverage[];
}): React.JSX.Element {
  return (
    <section aria-label="Coverage limitations" className={styles.coverage}>
      <AlertCircle
        size={19}
        aria-hidden="true"
        className={styles.coverageIcon}
      />
      <div className={styles.coverageContent}>
        <h2>Coverage is incomplete</h2>
        <p>
          Unreviewed areas may have additional obligations. Completion covers
          applicable published actions.
        </p>
        <details className={styles.coverageDetails}>
          <summary>
            Review jurisdiction and topic coverage{" "}
            <ChevronDown size={15} aria-hidden="true" />
          </summary>
          <ul>
            {coverage.map((cell, index) => (
              <li key={`${cell.jurisdiction}:${cell.topic}:${index}`}>
                <strong>{words(cell.topic)}</strong>
                <span>
                  {cell.jurisdiction ?? "Location unresolved"} ·{" "}
                  {cell.sector ? words(cell.sector) : "Sector unresolved"}
                </span>
                <p>
                  {words(cell.status)} · Regional coverage:{" "}
                  {words(cell.regionalStatus)}
                </p>
                <p>{cell.reason}</p>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </section>
  );
}
