"use client";

import React from "react";
import { CircleHelp, ShieldCheck } from "lucide-react";
import type { AccessTagKey } from "@pathway/platform/access-tags";
import type {
  BadgeScope,
  BadgeState,
  PersonAccess,
  PersonBadge,
} from "@/lib/roles-access-api";
import type { BadgeWriteStatus } from "./person-badges";

type ErrorStatus = Extract<BadgeWriteStatus, { kind: "error" }>;

function explicitBadgeState(
  badge: PersonBadge,
  scope: BadgeScope,
  siteId: string | null,
): BadgeState {
  const tenantId = scope === "organisation" ? null : siteId;
  if (badge.exclusions.some((entry) => entry.tenantId === tenantId))
    return "excluded";
  if (badge.directGrants.some((entry) => entry.tenantId === tenantId))
    return "enabled";
  return "inherit";
}

function restriction(
  access: PersonAccess,
  badge: PersonBadge,
  scope: BadgeScope,
): string {
  if (access.superUserExempt) return "Platform superuser is exempt";
  if (!badge.available) return "Unavailable";
  if (!access.canAdministerBadges) return "Organisation Head required";
  if (scope === "site" && !access.targetInSelectedSite)
    return "Person is not in this site";
  return "Not editable in this scope";
}

function BadgeDetails({
  badge,
  scope,
  currentState,
  roleNames,
  badgeNames,
  unavailableReason,
}: {
  badge: PersonBadge;
  scope: BadgeScope;
  currentState: BadgeState;
  roleNames: Map<string, string>;
  badgeNames: Map<AccessTagKey, string>;
  unavailableReason: string | null;
}) {
  const sources = [
    ...badge.sourceRoleIds.map((id) => roleNames.get(id) ?? id),
    ...(badge.directGrants.length ? ["Direct badge grant"] : []),
  ];
  return (
    <>
      <strong className="block text-sm font-semibold text-text-primary">
        {badge.label}
      </strong>
      <span className="mt-1 block">{badge.description}</span>
      <span className="mt-2 block">
        Current access:{" "}
        {badge.selected
          ? "Included"
          : badge.effectiveCoverage === "partial"
            ? "Partial"
            : "No access"}
        {currentState === "inherit" && badge.selected ? " (inherited)" : ""}
        {currentState === "excluded" ? " (excluded in this scope)" : ""}.
      </span>
      <span className="mt-1 block">
        Editing: {scope === "site" ? "selected site" : "organisation-wide"}.
      </span>
      <span className="mt-1 block">
        Available scopes:{" "}
        {badge.allowedScopes
          .map((value) => (value === "site" ? "site" : "organisation"))
          .join(", ") || "none"}
        .
      </span>
      <span className="mt-1 block">
        Sources: {sources.join(", ") || "No role or grant source"}.
      </span>
      {badge.blockingTags.length > 0 && (
        <span className="mt-1 block">
          Blocked by:{" "}
          {badge.blockingTags
            .map((key) => badgeNames.get(key) ?? key)
            .join(", ")}
          .
        </span>
      )}
      <span className="mt-2 block break-words text-text-muted">
        Permissions: {badge.permissionKeys.join(", ") || "None mapped"}.
      </span>
      {unavailableReason && (
        <span className="mt-2 block text-status-danger">
          {unavailableReason}.
        </span>
      )}
    </>
  );
}

export function PersonBadgeControl({
  badge,
  access,
  scope,
  siteId,
  status,
  roleNames,
  badgeNames,
  onStateChange,
  onRetry,
}: {
  badge: PersonBadge;
  access: PersonAccess;
  scope: BadgeScope;
  siteId: string | null;
  status: BadgeWriteStatus | undefined;
  roleNames: Map<string, string>;
  badgeNames: Map<AccessTagKey, string>;
  onStateChange: (state: BadgeState) => void;
  onRetry: (status: ErrorStatus) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState({ top: 0, left: 0 });
  const containerRef = React.useRef<HTMLLIElement>(null);
  const tooltipId = React.useId();
  const currentState = explicitBadgeState(badge, scope, siteId);
  const editable = badge.editableScopes.includes(scope);
  const unavailableReason = editable ? null : restriction(access, badge, scope);
  const pending = status?.kind === "pending";

  const showDetails = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      setPosition({
        top: Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 320)),
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 296)),
      });
    }
    setOpen(true);
  };

  React.useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof window.Node &&
        !containerRef.current?.contains(event.target)
      )
        setOpen(false);
    };
    const closeOnScroll = () => setOpen(false);
    window.addEventListener("keydown", close);
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("scroll", closeOnScroll, true);
    return () => {
      window.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [open]);

  return (
    <li
      ref={containerRef}
      className="relative min-w-0 max-w-full"
      onMouseEnter={showDetails}
      onMouseLeave={() => setOpen(false)}
      onFocus={showDetails}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <div className="inline-flex max-w-full items-center gap-1">
        <button
          type="button"
          aria-label={`${badge.label}: ${badge.selected ? "included" : badge.effectiveCoverage === "partial" ? "partial access" : "no access"}`}
          aria-pressed={badge.selected}
          aria-describedby={open ? tooltipId : undefined}
          disabled={!editable || pending}
          onClick={() => onStateChange(badge.selected ? "excluded" : "enabled")}
          className={`inline-flex min-h-8 min-w-0 max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-info disabled:cursor-not-allowed disabled:opacity-50 ${
            badge.selected
              ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
              : badge.effectiveCoverage === "partial"
                ? "border-status-warning bg-status-warning/10 text-text-primary"
                : "border-border-subtle bg-surface text-text-secondary hover:border-accent-primary"
          }`}
        >
          <ShieldCheck aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate">{badge.label}</span>
          {badge.effectiveCoverage === "partial" && (
            <span className="text-[10px]">Partial</span>
          )}
          {currentState === "excluded" && (
            <span className="text-[10px]">Excluded</span>
          )}
          {!badge.available && <span className="text-[10px]">Unavailable</span>}
        </button>
        <button
          type="button"
          aria-label={`Details about ${badge.label}`}
          aria-expanded={open}
          aria-describedby={open ? tooltipId : undefined}
          onClick={showDetails}
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-text-muted hover:text-accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-info"
        >
          <CircleHelp aria-hidden="true" className="size-4" />
        </button>
      </div>
      {currentState !== "inherit" && editable && (
        <button
          type="button"
          disabled={pending}
          onClick={() => onStateChange("inherit")}
          className="ml-2 block rounded text-[11px] text-text-muted underline hover:text-accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-info disabled:opacity-50"
        >
          Use role defaults
        </button>
      )}
      {status && (
        <span
          role="status"
          className="mt-1 block max-w-64 text-xs text-text-muted"
        >
          {pending && "Saving…"}
          {status.kind === "saved" && "Saved"}
          {status.kind === "error" && (
            <span className="text-status-danger">
              {status.message}
              {status.blockingTags.length > 0 &&
                ` ${status.blockingTags.map((key) => badgeNames.get(key) ?? key).join(", ")}`}
              {editable && (
                <button
                  type="button"
                  onClick={() => onRetry(status)}
                  className="ml-1 rounded underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-info"
                >
                  Retry
                </button>
              )}
            </span>
          )}
        </span>
      )}
      {open && (
        <div
          id={tooltipId}
          role="tooltip"
          style={{ top: position.top, left: position.left }}
          className="fixed z-30 max-h-[min(24rem,80vh)] w-[min(18rem,calc(100vw-1rem))] overflow-y-auto rounded-lg border border-border-subtle bg-surface p-3 text-left text-xs font-normal leading-relaxed text-text-secondary shadow-lg"
        >
          <BadgeDetails
            badge={badge}
            scope={scope}
            currentState={currentState}
            roleNames={roleNames}
            badgeNames={badgeNames}
            unavailableReason={unavailableReason}
          />
        </div>
      )}
    </li>
  );
}
