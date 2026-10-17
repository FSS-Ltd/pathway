"use client";

import React from "react";
import type {
  TrackerCategoryProgress,
  TrackerChecklistItem,
  TrackerTopic,
} from "@pathway/types";
import { ArrowRight, ListChecks } from "lucide-react";
import { RequirementRow } from "./requirement-row";
import { words } from "./profile-fields";
import styles from "./checklist-browser.module.css";

interface ChecklistBrowserProps {
  categories: TrackerCategoryProgress[];
  items: TrackerChecklistItem[];
  profileVersion: number;
  canManage: boolean;
  onChange: () => void;
}

export function ChecklistBrowser({
  categories,
  items,
  profileVersion,
  canManage,
  onChange,
}: ChecklistBrowserProps): React.JSX.Element {
  const topics = Array.from(
    new Set([
      ...categories.map((category) => category.topic),
      ...items.map((item) => item.requirement.topic),
    ]),
  );
  const [selectedTopic, setSelectedTopic] = React.useState<TrackerTopic | null>(
    null,
  );
  const activeTopic =
    selectedTopic && topics.includes(selectedTopic) ? selectedTopic : topics[0];
  const headingId = React.useId();

  return (
    <section className={styles.browser} aria-labelledby={headingId}>
      <header className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Your action plan</p>
          <h2 id={headingId}>Checklist actions</h2>
        </div>
        <span className={styles.total}>
          <ListChecks size={17} aria-hidden="true" />
          {items.length} published actions
        </span>
      </header>
      {topics.length > 0 ? (
        <div className={styles.layout}>
          <div
            className={styles.topics}
            role="group"
            aria-label="Checklist topics"
          >
            {topics.map((topic) => {
              const count = items.filter(
                (item) => item.requirement.topic === topic,
              ).length;
              return (
                <button
                  className={styles.topic}
                  type="button"
                  key={topic}
                  aria-pressed={topic === activeTopic}
                  onClick={() => setSelectedTopic(topic)}
                >
                  <span>{words(topic)}</span>
                  <span className={styles.topicCount}>{count}</span>
                  <ArrowRight
                    className={styles.topicArrow}
                    size={15}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>
          {topics.map((topic) => {
            const category = categories.find((value) => value.topic === topic);
            const topicItems = items.filter(
              (item) => item.requirement.topic === topic,
            );
            return (
              <section
                key={topic}
                hidden={topic !== activeTopic}
                className={styles.panel}
                aria-label={words(topic)}
              >
                <header className={styles.panelHeader}>
                  <div>
                    <h3>{words(topic)}</h3>
                    <p>
                      {category?.applicable
                        ? `${category.completed} of ${category.applicable} applicable actions completed`
                        : category
                          ? "No applicable items"
                          : "Review the published actions for this topic"}
                    </p>
                  </div>
                  <span className={styles.actionCount}>
                    {topicItems.length}{" "}
                    {topicItems.length === 1 ? "action" : "actions"}
                  </span>
                </header>
                {topicItems.length > 0 ? (
                  <div className={styles.rows}>
                    {topicItems.map((item) => (
                      <RequirementRow
                        key={`${item.requirement.id}:${item.requirement.version}`}
                        item={item}
                        profileVersion={profileVersion}
                        canManage={canManage}
                        onChange={onChange}
                      />
                    ))}
                  </div>
                ) : (
                  <p className={styles.empty}>
                    No published actions are available for this topic. Review
                    the coverage details for any limitations.
                  </p>
                )}
                <p className={styles.note}>
                  All published actions in this topic are shown, including
                  unresolved and not applicable items. Completion records manual
                  confirmations.
                </p>
              </section>
            );
          })}
        </div>
      ) : (
        <p className={styles.empty}>
          No published actions are available for the current profile. Review the
          coverage details and keep the site profile current.
        </p>
      )}
    </section>
  );
}
