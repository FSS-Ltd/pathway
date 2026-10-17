"use client";

import React from "react";
import type {
  TrackerCategoryProgress,
  TrackerChecklistItem,
  TrackerTopic,
} from "@pathway/types";
import { ArrowLeft, ArrowRight, ListChecks } from "lucide-react";
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

function TopicPanel({
  topic,
  category,
  items,
  profileVersion,
  canManage,
  onChange,
  hidden,
}: {
  topic: TrackerTopic;
  category: TrackerCategoryProgress | undefined;
  items: TrackerChecklistItem[];
  profileVersion: number;
  canManage: boolean;
  onChange: () => void;
  hidden: boolean;
}): React.JSX.Element {
  const [selectedIndex, setSelectedIndex] = React.useState(() =>
    Math.max(
      0,
      items.findIndex(
        (item) => item.applicability === "APPLICABLE" && !item.completed,
      ),
    ),
  );
  const currentIndex = Math.min(selectedIndex, Math.max(0, items.length - 1));
  return (
    <section
      className={styles.panel}
      role="tabpanel"
      id={`topic-panel-${topic}`}
      aria-labelledby={`topic-tab-${topic}`}
      hidden={hidden}
    >
      <header className={styles.panelHeader}>
        <div>
          <h3>{words(topic)}</h3>
          <p>
            {category?.applicable
              ? `${category.completed} of ${category.applicable} applicable actions completed`
              : "No applicable items"}
          </p>
        </div>
        {items.length > 0 && (
          <span className={styles.actionCount}>
            Action {currentIndex + 1} of {items.length}
          </span>
        )}
      </header>
      {items.length > 0 ? (
        <>
          {items.map((item, index) => (
            <div
              key={`${item.requirement.id}:${item.requirement.version}`}
              hidden={index !== currentIndex}
            >
              <RequirementRow
                item={item}
                profileVersion={profileVersion}
                canManage={canManage}
                onChange={onChange}
                onConfirmed={(status) => {
                  if (status !== "NOT_STARTED" && index < items.length - 1)
                    setSelectedIndex(index + 1);
                }}
                guided={index === currentIndex && !hidden}
              />
            </div>
          ))}
          <nav
            className={styles.stepNav}
            aria-label={`${words(topic)} action navigation`}
          >
            <button
              type="button"
              disabled={currentIndex === 0}
              onClick={() => setSelectedIndex(currentIndex - 1)}
            >
              <ArrowLeft size={16} aria-hidden="true" /> Previous
            </button>
            <span aria-live="polite">
              {currentIndex + 1} / {items.length}
            </span>
            <button
              type="button"
              disabled={currentIndex >= items.length - 1}
              onClick={() => setSelectedIndex(currentIndex + 1)}
            >
              Next <ArrowRight size={16} aria-hidden="true" />
            </button>
          </nav>
        </>
      ) : (
        <p className={styles.empty}>
          No published actions are available for this topic. Review the coverage
          alert for limitations.
        </p>
      )}
    </section>
  );
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
          <h2 id={headingId}>One action at a time</h2>
        </div>
        <span className={styles.total}>
          <ListChecks size={17} aria-hidden="true" />
          {items.length} published actions
        </span>
      </header>
      {topics.length > 0 ? (
        <>
          <div
            className={styles.topics}
            role="tablist"
            aria-label="Checklist topics"
          >
            {topics.map((topic) => (
              <button
                className={styles.topic}
                type="button"
                role="tab"
                id={`topic-tab-${topic}`}
                aria-controls={`topic-panel-${topic}`}
                aria-selected={topic === activeTopic}
                tabIndex={topic === activeTopic ? 0 : -1}
                key={topic}
                onClick={() => setSelectedTopic(topic)}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
                    return;
                  const next =
                    topics[
                      (topics.indexOf(topic) +
                        (event.key === "ArrowRight" ? 1 : topics.length - 1)) %
                        topics.length
                    ];
                  setSelectedTopic(next);
                  document.getElementById(`topic-tab-${next}`)?.focus();
                }}
              >
                {words(topic)}{" "}
                <span className={styles.topicCount}>
                  {
                    items.filter((item) => item.requirement.topic === topic)
                      .length
                  }
                </span>
              </button>
            ))}
          </div>
          {topics.map((topic) => (
            <TopicPanel
              key={topic}
              topic={topic}
              category={categories.find((value) => value.topic === topic)}
              items={items.filter((item) => item.requirement.topic === topic)}
              profileVersion={profileVersion}
              canManage={canManage}
              onChange={onChange}
              hidden={topic !== activeTopic}
            />
          ))}
          <p className={styles.note}>
            Actions remain manual. You can revisit earlier checks; completing
            one moves to the next action.
          </p>
        </>
      ) : (
        <p className={styles.empty}>
          No published actions are available for the current profile. Review the
          coverage alert and keep the site profile current.
        </p>
      )}
    </section>
  );
}
