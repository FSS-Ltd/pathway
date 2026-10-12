"use client";

import React from "react";
import { Button } from "@pathway/ui";
import type { BadgeScope, PersonBadge } from "@/lib/roles-access-api";

export function BadgeExclusionDialog({
  badge,
  badges,
  scope,
  onCancel,
  onConfirm,
}: {
  badge: PersonBadge;
  badges: PersonBadge[];
  scope: BadgeScope;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  const confirmRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => cancelRef.current?.focus(), []);
  const overlaps = badges.filter(
    (item) =>
      item.key !== badge.key &&
      item.permissionKeys.some((key) => badge.permissionKeys.includes(key)),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="badge-exclusion-title"
        aria-describedby="badge-exclusion-description"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
          if (event.key === "Tab") {
            if (
              event.shiftKey &&
              document.activeElement === cancelRef.current
            ) {
              event.preventDefault();
              confirmRef.current?.focus();
            } else if (
              !event.shiftKey &&
              document.activeElement === confirmRef.current
            ) {
              event.preventDefault();
              cancelRef.current?.focus();
            }
          }
        }}
        className="w-full max-w-lg rounded-xl border border-border-subtle bg-surface p-5 shadow-xl"
      >
        <h3
          id="badge-exclusion-title"
          className="font-heading text-lg font-semibold text-text-primary"
        >
          Exclude {badge.label}?
        </h3>
        <p
          id="badge-exclusion-description"
          className="mt-2 text-sm text-text-secondary"
        >
          This removes {badge.permissionKeys.length} mapped permissions in the{" "}
          {scope === "site" ? "selected site" : "whole organisation"}, including
          access from roles and other badges.
        </p>
        <p className="mt-3 break-words text-xs text-text-muted">
          Permissions: {badge.permissionKeys.join(", ") || "None mapped"}
        </p>
        <p className="mt-2 text-xs text-text-muted">
          Overlapping badges:{" "}
          {overlaps.map((item) => item.label).join(", ") || "None"}
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button ref={confirmRef} onClick={onConfirm}>
            Exclude badge
          </Button>
        </div>
      </div>
    </div>
  );
}
