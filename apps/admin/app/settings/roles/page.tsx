"use client";

import React from "react";
import { useSession } from "@/lib/use-session-compat";
import { Button, Card } from "@pathway/ui";
import {
  fetchActiveSiteState,
  fetchPeopleForOrg,
  fetchRoles,
  type AdminRoleDefinition,
  type PersonRow,
} from "@/lib/api-client";
import { useAdminAccess } from "@/lib/use-admin-access";
import { subscribeToActiveSiteChanges } from "@/lib/active-site-events";
import { hasPermission } from "@/lib/access";
import { NoAccessCard } from "@/components/no-access-card";
import { RoleListTable } from "./role-list-table";
import { AssignmentPanel } from "./assignment-panel";
import { EffectiveAccessPanel } from "./effective-access-panel";
import { AuditLogPanel } from "./audit-log-panel";

type Tab = "roles" | "assignments" | "effective-access" | "audit";

export default function RolesAdminPage() {
  const { data: session, status: sessionStatus } = useSession();
  const { permissions, isLoading: isLoadingAccess } = useAdminAccess();
  const canAccess = hasPermission(permissions, "platform.access.roles.read");
  const [orgId, setOrgId] = React.useState<string | null>(null);
  const [activeSiteId, setActiveSiteId] = React.useState<string | null>(null);
  const [roles, setRoles] = React.useState<AdminRoleDefinition[]>([]);
  const [people, setPeople] = React.useState<PersonRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<Tab>("roles");
  const loadVersion = React.useRef(0);

  const load = React.useCallback(async () => {
    const version = ++loadVersion.current;
    setIsLoading(true);
    setError(null);
    try {
      const state = await fetchActiveSiteState();
      const resolvedOrgId =
        state.sites.find((s) => s.id === state.activeSiteId)?.orgId ??
        state.sites[0]?.orgId ??
        null;
      if (!resolvedOrgId) {
        throw new Error("Active organisation not found.");
      }
      const [rolesData, peopleData] = await Promise.all([
        fetchRoles(),
        fetchPeopleForOrg(resolvedOrgId),
      ]);
      if (version !== loadVersion.current) return;
      setActiveSiteId(state.activeSiteId);
      setOrgId(resolvedOrgId);
      setRoles(rolesData);
      setPeople(peopleData);
    } catch (err) {
      if (version !== loadVersion.current) return;
      setOrgId(null);
      setActiveSiteId(null);
      setRoles([]);
      setPeople([]);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load roles & access data",
      );
    } finally {
      if (version === loadVersion.current) setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (sessionStatus !== "authenticated" || !session) return;
    if (isLoadingAccess || !canAccess) return;
    void load();
    const unsubscribe = subscribeToActiveSiteChanges(() => {
      void load();
    });
    return () => {
      loadVersion.current += 1;
      unsubscribe();
    };
  }, [sessionStatus, session, isLoadingAccess, canAccess, load]);

  if (isLoadingAccess) {
    return (
      <div className="flex flex-col gap-4">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-4 w-96 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <NoAccessCard
        title="You don't have access to roles & access"
        message="Roles and permissions are only available to organisation admins."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary font-heading">
            Roles & Access
          </h1>
          <p className="text-sm text-text-muted">
            Review fixed roles, access assignments, and audit history
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={load}>
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
          {error}
        </div>
      )}

      <div className="flex gap-4 border-b border-border pb-0">
        {(
          [
            ["roles", `Roles (${roles.length})`],
            ["assignments", "Assignments"],
            ["effective-access", "Effective access"],
            ["audit", "Audit log"],
          ] as [Tab, string][]
        ).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-2 px-1 text-sm font-medium transition-colors border-b-2 ${
              activeTab === tab
                ? "border-accent text-accent"
                : "border-transparent text-text-muted hover:text-text-primary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Card>
          <div className="h-64 animate-pulse rounded bg-muted" />
        </Card>
      ) : orgId ? (
        <>
          {activeTab === "roles" && (
            <Card
              title="Role definitions"
              description="Platform roles and historical custom roles"
            >
              <RoleListTable roles={roles} />
            </Card>
          )}
          {activeTab === "assignments" && (
            <AssignmentPanel
              roles={roles}
              people={people}
              activeSiteId={activeSiteId}
            />
          )}
          {activeTab === "effective-access" && (
            <EffectiveAccessPanel roles={roles} people={people} />
          )}
          {activeTab === "audit" && <AuditLogPanel people={people} />}
        </>
      ) : null}
    </div>
  );
}
