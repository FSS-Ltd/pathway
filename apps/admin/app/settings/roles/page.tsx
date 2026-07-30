"use client";

import React from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button, Card } from "@pathway/ui";
import {
  fetchActiveSiteState,
  fetchPeopleForOrg,
  fetchRoles,
  type AdminRoleDefinition,
  type PersonRow,
} from "@/lib/api-client";
import { useAdminAccess } from "@/lib/use-admin-access";
import { canAccessRolesAdmin } from "@/lib/access";
import { NoAccessCard } from "@/components/no-access-card";
import { RoleListTable } from "./role-list-table";
import { AssignmentPanel } from "./assignment-panel";
import { EffectiveAccessPanel } from "./effective-access-panel";
import { AuditLogPanel } from "./audit-log-panel";

type Tab = "roles" | "assignments" | "effective-access" | "audit";

export default function RolesAdminPage() {
  const { data: session, status: sessionStatus } = useSession();
  const { role, isLoading: isLoadingAccess } = useAdminAccess();
  const [orgId, setOrgId] = React.useState<string | null>(null);
  const [roles, setRoles] = React.useState<AdminRoleDefinition[]>([]);
  const [people, setPeople] = React.useState<PersonRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<Tab>("roles");

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const state = await fetchActiveSiteState();
      const resolvedOrgId =
        state.sites.find((s) => s.id === state.activeSiteId)?.orgId ??
        state.sites[0]?.orgId ??
        null;
      setOrgId(resolvedOrgId);
      if (!resolvedOrgId) {
        throw new Error("Active organisation not found.");
      }
      const [rolesData, peopleData] = await Promise.all([
        fetchRoles(),
        fetchPeopleForOrg(resolvedOrgId),
      ]);
      setRoles(rolesData);
      setPeople(peopleData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load roles & access data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (sessionStatus !== "authenticated" || !session) return;
    if (isLoadingAccess || !canAccessRolesAdmin(role)) return;
    void load();
  }, [sessionStatus, session, isLoadingAccess, role, load]);

  if (isLoadingAccess) {
    return (
      <div className="flex flex-col gap-4">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-4 w-96 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (!canAccessRolesAdmin(role)) {
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
            Create custom roles, assign them, and review access and audit history
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={load}>
            Refresh
          </Button>
          {activeTab === "roles" && (
            <Button asChild size="sm">
              <Link href="/settings/roles/new">+ New role</Link>
            </Button>
          )}
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
              title="Custom roles"
              description="Roles created for this organisation"
            >
              <RoleListTable roles={roles} onChanged={load} />
            </Card>
          )}
          {activeTab === "assignments" && (
            <AssignmentPanel roles={roles} people={people} />
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
