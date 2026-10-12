"use client";

import React from "react";
import { Badge, Button } from "@pathway/ui";
import type { AccessPerson, PersonAccess } from "@/lib/roles-access-api";
import { PersonBadges } from "./person-badges";
import { PersonRoles } from "./person-roles";
import { ProfileFacts } from "./profile-facts";

export type PersonTab = "profile" | "roles" | "badges";

export function PersonProfile({
  person,
  access,
  tab,
  onTabChange,
  onBack,
  onRefresh,
  orgName,
  siteId,
  siteName,
  canManageRoles,
}: {
  person: AccessPerson;
  access: PersonAccess;
  tab: PersonTab;
  onTabChange: (tab: PersonTab) => void;
  onBack: () => void;
  onRefresh: () => Promise<void>;
  orgName: string;
  siteId: string | null;
  siteName: string | null;
  canManageRoles: boolean;
}) {
  const tabs: Array<{ id: PersonTab; label: string }> = [
    { id: "profile", label: "Profile" },
    { id: "roles", label: "Roles" },
    { id: "badges", label: "Badges" },
  ];
  return (
    <section
      className="min-w-0 rounded-xl border border-border-subtle bg-surface p-4 sm:p-5"
      aria-labelledby="selected-person-title"
    >
      <Button
        variant="secondary"
        size="sm"
        className="mb-3 lg:hidden"
        onClick={onBack}
      >
        Back to people
      </Button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
            Selected person
          </p>
          <h2
            id="selected-person-title"
            className="font-heading text-xl font-semibold text-text-primary"
          >
            {access.user.displayName || access.user.name || person.email}
          </h2>
          <p className="text-sm text-text-muted">{access.user.email}</p>
        </div>
        {access.superUserExempt && (
          <Badge variant="accent">Platform superuser · badge exempt</Badge>
        )}
      </div>
      <div
        role="tablist"
        aria-label="Person access views"
        className="mt-5 flex gap-1 border-b border-border-subtle"
      >
        {tabs.map((item) => (
          <button
            key={item.id}
            id={`person-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`person-panel-${item.id}`}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => onTabChange(item.id)}
            onKeyDown={(event) => {
              const direction =
                event.key === "ArrowRight"
                  ? 1
                  : event.key === "ArrowLeft"
                    ? -1
                    : 0;
              if (!direction) return;
              event.preventDefault();
              const index = tabs.findIndex((entry) => entry.id === tab);
              const next =
                tabs[(index + direction + tabs.length) % tabs.length];
              if (next) {
                onTabChange(next.id);
                document.getElementById(`person-tab-${next.id}`)?.focus();
              }
            }}
            className="rounded-t-md border-b-2 border-transparent px-3 py-2 text-sm font-medium text-text-muted hover:text-text-primary aria-selected:border-accent-primary aria-selected:text-accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-info"
          >
            {item.label}
          </button>
        ))}
      </div>
      {tabs
        .filter((item) => item.id !== tab)
        .map((item) => (
          <div
            key={item.id}
            id={`person-panel-${item.id}`}
            role="tabpanel"
            aria-labelledby={`person-tab-${item.id}`}
            hidden
          />
        ))}
      <div
        id={`person-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`person-tab-${tab}`}
        className="pt-5"
      >
        {tab === "profile" && (
          <ProfileFacts
            person={person}
            access={access}
            orgName={orgName}
            siteName={siteName}
          />
        )}
        {tab === "roles" && (
          <PersonRoles
            access={access}
            siteId={siteId}
            canManage={canManageRoles}
            onRefresh={onRefresh}
          />
        )}
        {tab === "badges" && (
          <PersonBadges access={access} siteId={siteId} onRefresh={onRefresh} />
        )}
      </div>
    </section>
  );
}
