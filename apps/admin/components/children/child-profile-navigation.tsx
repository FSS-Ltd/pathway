"use client";

import * as React from "react";
import { Card } from "@pathway/ui";

export type ChildProfileTabId =
  | "overview"
  | "details"
  | "contacts"
  | "registration"
  | "attendance"
  | "academics"
  | "pace"
  | "behaviour"
  | "discipline"
  | "merits"
  | "notes";
export type ChildProfileTab = { id: ChildProfileTabId; label: string };

export function ChildProfileNavigation({
  tabs,
  activeTab,
  onChange,
  label,
}: {
  tabs: readonly ChildProfileTab[];
  activeTab: ChildProfileTabId;
  onChange: (tab: ChildProfileTabId) => void;
  label: string;
}) {
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const current = tabs.findIndex((tab) => tab.id === activeTab);
    const last = tabs.length - 1;
    let next = current;
    if (event.key === "ArrowRight") next = (current + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (current + last) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else return;

    event.preventDefault();
    const tab = tabs[next];
    if (!tab) return;
    onChange(tab.id);
    const buttons =
      event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]");
    buttons[next]?.focus();
  };

  return (
    <Card className="p-1">
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="flex gap-1 overflow-x-auto"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`child-profile-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls="child-profile-panel"
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={`shrink-0 whitespace-nowrap rounded-md px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-strong ${
              activeTab === tab.id
                ? "bg-accent-subtle text-accent-strong"
                : "text-text-muted hover:bg-surface-alt hover:text-text-primary"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </Card>
  );
}
