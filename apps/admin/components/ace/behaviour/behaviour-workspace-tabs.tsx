"use client";

import React from "react";

export type BehaviourWorkspaceTab = "record" | "trends";

export function BehaviourWorkspaceTabs({
  value,
  onChange,
}: {
  value: BehaviourWorkspaceTab;
  onChange: (tab: BehaviourWorkspaceTab) => void;
}) {
  const recordRef = React.useRef<HTMLButtonElement>(null);
  const trendsRef = React.useRef<HTMLButtonElement>(null);

  const choose = (tab: BehaviourWorkspaceTab) => {
    onChange(tab);
    (tab === "record" ? recordRef : trendsRef).current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowLeft" || event.key === "Home") {
      event.preventDefault();
      choose("record");
    } else if (event.key === "ArrowRight" || event.key === "End") {
      event.preventDefault();
      choose("trends");
    }
  };

  return (
    <div
      role="tablist"
      aria-label="Behaviour workspace"
      className="inline-flex max-w-full gap-1 rounded-xl border border-border-subtle bg-muted/50 p-1"
    >
      {(["record", "trends"] as const).map((tab) => (
        <button
          key={tab}
          ref={tab === "record" ? recordRef : trendsRef}
          id={`behaviour-${tab}-tab`}
          type="button"
          role="tab"
          aria-selected={value === tab}
          aria-controls={`behaviour-${tab}-panel`}
          tabIndex={value === tab ? 0 : -1}
          onClick={() => choose(tab)}
          onKeyDown={onKeyDown}
          className={`min-h-10 rounded-lg px-4 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${value === tab ? "bg-surface text-text-primary shadow-sm" : "text-text-muted hover:text-text-primary"}`}
        >
          {tab === "record" ? "Record behaviour" : "Behaviour trends"}
        </button>
      ))}
    </div>
  );
}
