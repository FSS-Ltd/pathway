import React from "react";
import { AlertCircle, ChevronDown, X } from "lucide-react";
import type { TrackerCoverage } from "@pathway/types";
import { words } from "./profile-fields";
import styles from "./workspace.module.css";

export function CoverageNotice({
  coverage,
}: {
  coverage: TrackerCoverage[];
}): React.JSX.Element {
  const [expanded, setExpanded] = React.useState(false);
  return (
    <section aria-label="Coverage limitations" className={styles.coverage}>
      <button
        type="button"
        className={styles.coverageToggle}
        aria-expanded={expanded}
        aria-controls="tracker-coverage-details"
        onClick={() => setExpanded(!expanded)}
      >
        <AlertCircle size={18} aria-hidden="true" />
        <span>Coverage incomplete</span>
        {expanded ? (
          <X size={17} aria-hidden="true" />
        ) : (
          <ChevronDown size={17} aria-hidden="true" />
        )}
      </button>
      <div
        id="tracker-coverage-details"
        className={styles.coverageContent}
        hidden={!expanded}
      >
        <p>
          Unreviewed areas may have additional obligations. Checklist completion
          covers published actions only. Check with your local authority or
          relevant regulator before relying on this list.
        </p>
        <div className={styles.coverageDetails}>
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
        </div>
      </div>
    </section>
  );
}
