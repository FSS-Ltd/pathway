"use client";

import React from "react";
import type { AccessTagKey } from "@pathway/platform/access-tags";
import { Label, Select } from "@pathway/ui";
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
import { PersonBadgeControl } from "./person-badge-control";

export type BadgeWriteStatus =
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
  const [statuses, setStatuses] = React.useState<
    Record<string, BadgeWriteStatus>
  >({});
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
    const statusKey = `${targetScope}:${badge.key}`;
    setStatuses((current) => ({
      ...current,
      [statusKey]: { kind: "pending" },
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
        [statusKey]: { kind: "saved" },
      }));
    } catch (failure) {
      const error = failure instanceof BadgeMutationError ? failure : null;
      setStatuses((current) => ({
        ...current,
        [statusKey]: {
          kind: "error",
          message:
            failure instanceof Error
              ? failure.message
              : "Unable to save badge.",
          blockingTags: error?.blockingTags ?? [],
          state,
          scope: targetScope,
          requestId:
            error?.code === "BADGE_STATE_CONFLICT"
              ? crypto.randomUUID()
              : requestId,
        },
      }));
      if (error?.code === "BADGE_STATE_CONFLICT") {
        try {
          await onRefresh();
        } catch {
          /* The visible error remains retryable. */
        }
      }
    }
  };

  const requestState = (badge: PersonBadge, state: BadgeState) => {
    if (state === "excluded") {
      triggerRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setConfirmBadge(badge);
    } else {
      void write(badge, state);
    }
  };
  const closeConfirmation = () => {
    setConfirmBadge(null);
    queueMicrotask(() => triggerRef.current?.focus());
  };
  const roleNames = new Map(access.roles.map((role) => [role.id, role.name]));
  const badgeNames = new Map(
    access.badges.map((badge) => [badge.key, badge.label]),
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-xl text-sm text-text-muted">
          Select badges to add permissions. Selected badges may come from roles
          or direct grants. Excluding a badge removes its mapped permissions
          until cleared.
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
      {access.badges.length ? (
        <ul
          aria-label={`Badges for ${access.user.displayName || access.user.name || access.user.email}`}
          className="flex flex-wrap items-start gap-3"
        >
          {access.badges.map((badge) => (
            <PersonBadgeControl
              key={badge.key}
              badge={badge}
              access={access}
              scope={scope}
              siteId={siteId}
              status={statuses[`${scope}:${badge.key}`]}
              roleNames={roleNames}
              badgeNames={badgeNames}
              onStateChange={(state) => requestState(badge, state)}
              onRetry={(status) =>
                void write(badge, status.state, status.scope, status.requestId)
              }
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-text-muted">No badges are defined.</p>
      )}
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
