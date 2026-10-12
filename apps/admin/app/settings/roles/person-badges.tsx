"use client";

import React from "react";
import type { AccessTagKey } from "@pathway/platform/access-tags";
import { Badge, DataTable, Label, Select, type ColumnDef } from "@pathway/ui";
import type {
  BadgeScope,
  BadgeState,
  PersonAccess,
  PersonBadge,
} from "@/lib/roles-access-api";
import {
  BadgeMutationError,
  setPersonBadgeState,
} from "@/lib/roles-access-api";
import { BadgeExclusionDialog } from "./badge-exclusion-dialog";

type WriteStatus =
  | { kind: "pending" }
  | { kind: "saved" }
  | {
      kind: "error";
      message: string;
      blockingTags: AccessTagKey[];
      state: BadgeState;
      scope: BadgeScope;
      requestId: string;
    };

function explicitState(
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

export function PersonBadges({
  access,
  siteId,
  onRefresh,
}: {
  access: PersonAccess;
  siteId: string | null;
  onRefresh: () => Promise<void>;
}) {
  const [scope, setScope] = React.useState<BadgeScope>(
    siteId ? "site" : "organisation",
  );
  const [statuses, setStatuses] = React.useState<Record<string, WriteStatus>>(
    {},
  );
  const [confirmBadge, setConfirmBadge] = React.useState<PersonBadge | null>(
    null,
  );
  const triggerRef = React.useRef<HTMLElement | null>(null);
  React.useEffect(() => {
    setScope(siteId ? "site" : "organisation");
    setStatuses({});
    setConfirmBadge(null);
  }, [access.user.id, siteId]);

  const write = async (
    badge: PersonBadge,
    state: BadgeState,
    targetScope = scope,
    requestId = crypto.randomUUID(),
  ) => {
    setStatuses((current) => ({
      ...current,
      [badge.key]: { kind: "pending" },
    }));
    try {
      await setPersonBadgeState({
        userId: access.user.id,
        tagKey: badge.key,
        scope: targetScope,
        state,
        requestId,
        expectedRevision:
          targetScope === "site"
            ? (badge.revisions.site ?? "")
            : badge.revisions.organisation,
      });
      await onRefresh();
      setStatuses((current) => ({
        ...current,
        [badge.key]: { kind: "saved" },
      }));
    } catch (failure) {
      const error = failure instanceof BadgeMutationError ? failure : null;
      setStatuses((current) => ({
        ...current,
        [badge.key]: {
          kind: "error",
          message:
            failure instanceof Error
              ? failure.message
              : "Unable to save badge.",
          blockingTags: error?.blockingTags ?? [],
          state,
          scope: targetScope,
          requestId,
        },
      }));
      if (error?.code === "BADGE_STATE_CONFLICT") void onRefresh();
    }
  };
  const requestState = (badge: PersonBadge, state: BadgeState) => {
    if (state === "excluded") {
      triggerRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setConfirmBadge(badge);
    } else void write(badge, state);
  };
  const closeConfirmation = () => {
    setConfirmBadge(null);
    queueMicrotask(() => triggerRef.current?.focus());
  };
  const roleNames = new Map(access.roles.map((role) => [role.id, role.name]));
  const badgeNames = new Map(
    access.badges.map((badge) => [badge.key, badge.label]),
  );
  const columns: ColumnDef<PersonBadge>[] = [
    {
      id: "badge",
      header: "Badge",
      cell: (badge) => (
        <div>
          <span className="font-medium text-text-primary">{badge.label}</span>
          <p className="text-xs text-text-muted">{badge.description}</p>
          {!badge.available && <Badge variant="secondary">Unavailable</Badge>}
        </div>
      ),
    },
    {
      id: "effective",
      header: "Effective access",
      cell: (badge) => (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <Badge
            variant={
              badge.selected
                ? "success"
                : badge.effectiveCoverage === "partial"
                  ? "accent"
                  : "secondary"
            }
          >
            {badge.selected
              ? "Included"
              : badge.effectiveCoverage === "partial"
                ? "Partial"
                : "No access"}
          </Badge>
          {explicitState(badge, scope, siteId) === "inherit" &&
            badge.selected && (
              <span className="text-xs text-text-muted">Inherited</span>
            )}
        </span>
      ),
    },
    {
      id: "sources",
      header: "Sources",
      priority: "secondary",
      cell: (badge) => (
        <span className="text-xs text-text-muted">
          {[
            ...badge.sourceRoleIds.map((id) => roleNames.get(id) ?? id),
            ...(badge.directGrants.length ? ["Direct badge grant"] : []),
          ].join(", ") || "No role or grant source"}
          {badge.blockingTags.length > 0 &&
            ` · Blocked by ${badge.blockingTags.map((key) => badgeNames.get(key) ?? key).join(", ")}`}
        </span>
      ),
    },
    {
      id: "controls",
      header: "Selected scope",
      cell: (badge) => {
        const status = statuses[badge.key];
        const currentState = explicitState(badge, scope, siteId);
        const editable = badge.editableScopes.includes(scope);
        return (
          <div className="min-w-48">
            <div
              className="flex flex-wrap gap-1"
              aria-label={`${badge.label} state for ${scope}`}
            >
              {(["enabled", "excluded", "inherit"] as const).map((state) => (
                <button
                  key={state}
                  type="button"
                  aria-pressed={currentState === state}
                  disabled={
                    !editable ||
                    status?.kind === "pending" ||
                    currentState === state
                  }
                  onClick={() => requestState(badge, state)}
                  className="rounded-md border border-border-subtle px-2 py-1 text-xs capitalize text-text-secondary hover:bg-muted aria-pressed:border-accent-primary aria-pressed:bg-accent-primary/10 aria-pressed:text-accent-primary disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-info"
                >
                  {state}
                </button>
              ))}
            </div>
            <span role="status" className="mt-1 block text-xs text-text-muted">
              {status?.kind === "pending" && "Saving…"}
              {status?.kind === "saved" && "Saved"}
              {status?.kind === "error" && (
                <span className="text-status-danger">
                  {status.message}
                  {status.blockingTags.length > 0 &&
                    ` ${status.blockingTags.map((key) => badgeNames.get(key) ?? key).join(", ")}`}
                  {editable && (
                    <button
                      type="button"
                      onClick={() =>
                        void write(
                          badge,
                          status.state,
                          status.scope,
                          status.requestId,
                        )
                      }
                      className="ml-1 rounded underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-info"
                    >
                      Retry
                    </button>
                  )}
                </span>
              )}
              {!status &&
                !editable &&
                (access.superUserExempt
                  ? "Platform superuser is exempt"
                  : !badge.available
                    ? "Unavailable"
                    : !access.canAdministerBadges
                      ? "Organisation Head required"
                      : scope === "site" && !access.targetInSelectedSite
                        ? "Person is not in this site"
                        : "Not editable in this scope")}
            </span>
          </div>
        );
      },
    },
  ];
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-xl text-sm text-text-muted">
          Included badges reflect role and direct grants. An exclusion removes
          its mapped permissions until explicitly cleared.
        </p>
        <div className="w-48">
          <Label htmlFor="badge-scope">Edit scope</Label>
          <Select
            id="badge-scope"
            value={scope}
            onChange={(event) => {
              setScope(event.target.value === "site" ? "site" : "organisation");
              setStatuses({});
            }}
          >
            {siteId && <option value="site">Selected site</option>}
            <option value="organisation">Organisation-wide</option>
          </Select>
        </div>
      </div>
      <DataTable
        data={access.badges}
        columns={columns}
        caption={`Badges for ${access.user.displayName || access.user.name || access.user.email}`}
        rowKey={(badge) => badge.key}
        pagination={{ mode: "client" }}
        emptyMessage="No badges are defined."
      />
      {confirmBadge && (
        <BadgeExclusionDialog
          badge={confirmBadge}
          badges={access.badges}
          scope={scope}
          onCancel={closeConfirmation}
          onConfirm={() => {
            const badge = confirmBadge;
            closeConfirmation();
            void write(badge, "excluded");
          }}
        />
      )}
    </section>
  );
}
