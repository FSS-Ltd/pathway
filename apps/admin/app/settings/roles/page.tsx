"use client";

import React from "react";
import { useAdminContext } from "@/lib/admin-context";
import { Button, Card } from "@pathway/ui";
import {
  fetchPeopleForOrg,
  fetchRoles,
  type AdminRoleDefinition,
  type PersonRow,
} from "@/lib/api-client";
import { useAdminAccess } from "@/lib/use-admin-access";
import { hasPermission } from "@/lib/access";
import { requestFailure, type RequestFailure } from "@/lib/request-error";
import { NoAccessCard } from "@/components/no-access-card";
import { RoleListTable } from "./role-list-table";
import { AssignmentPanel } from "./assignment-panel";
import { EffectiveAccessPanel } from "./effective-access-panel";
import { AuditLogPanel } from "./audit-log-panel";

type Tab = "roles" | "assignments" | "effective-access" | "audit";

export default function RolesAdminPage() {
  const { state: adminState } = useAdminContext();
  const { permissions, isLoading: isLoadingAccess } = useAdminAccess();
  const canAccess =
    permissions !== null &&
    hasPermission(permissions, "platform.access.roles.read");
  const orgId =
    adminState.status === "ready" ? adminState.snapshot.activeOrgId : null;
  const activeSiteId =
    adminState.status === "ready" ? adminState.snapshot.activeSiteId : null;
  const [roles, setRoles] = React.useState<AdminRoleDefinition[]>([]);
  const [people, setPeople] = React.useState<PersonRow[]>([]);
  const [loadingRoles, setLoadingRoles] = React.useState(true);
  const [loadingPeople, setLoadingPeople] = React.useState(true);
  const [rolesError, setRolesError] = React.useState<RequestFailure | null>(
    null,
  );
  const [peopleError, setPeopleError] = React.useState<RequestFailure | null>(
    null,
  );
  const [activeTab, setActiveTab] = React.useState<Tab>("roles");
  const loadVersion = React.useRef(0);

  const load = React.useCallback(async () => {
    if (!orgId) return;
    const version = ++loadVersion.current;
    setLoadingRoles(true);
    setLoadingPeople(true);
    setRolesError(null);
    setPeopleError(null);
    const [rolesResult, peopleResult] = await Promise.allSettled([
      fetchRoles(),
      fetchPeopleForOrg(orgId),
    ]);
    if (version !== loadVersion.current) return;
    if (rolesResult.status === "fulfilled") {
      setRoles(rolesResult.value);
    } else {
      setRoles([]);
      setRolesError(
        requestFailure(rolesResult.reason, "Unable to load roles."),
      );
    }
    if (peopleResult.status === "fulfilled") {
      setPeople(peopleResult.value);
    } else {
      setPeople([]);
      setPeopleError(
        requestFailure(peopleResult.reason, "Unable to load people."),
      );
    }
    setLoadingRoles(false);
    setLoadingPeople(false);
  }, [orgId]);

  React.useEffect(() => {
    if (adminState.status !== "ready") return;
    if (isLoadingAccess || !canAccess) return;
    void load();
    return () => {
      loadVersion.current += 1;
    };
  }, [adminState.status, isLoadingAccess, canAccess, load]);

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

  const dependencyFailure = rolesError ?? peopleError;

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

      {activeTab === "roles" && loadingRoles ? (
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
              {rolesError ? (
                <LoadFailure failure={rolesError} onRetry={load} />
              ) : (
                <RoleListTable roles={roles} />
              )}
            </Card>
          )}
          {activeTab === "assignments" &&
            (loadingRoles || loadingPeople ? (
              <Card>
                <div className="h-64 animate-pulse rounded bg-muted" />
              </Card>
            ) : dependencyFailure ? (
              <Card title="Assignments">
                <LoadFailure failure={dependencyFailure} onRetry={load} />
              </Card>
            ) : (
              <AssignmentPanel
                roles={roles}
                people={people}
                activeSiteId={activeSiteId}
              />
            ))}
          {activeTab === "effective-access" &&
            (loadingRoles || loadingPeople ? (
              <Card>
                <div className="h-64 animate-pulse rounded bg-muted" />
              </Card>
            ) : dependencyFailure ? (
              <Card title="Effective access">
                <LoadFailure failure={dependencyFailure} onRetry={load} />
              </Card>
            ) : (
              <EffectiveAccessPanel roles={roles} people={people} />
            ))}
          {activeTab === "audit" &&
            (loadingPeople ? (
              <Card>
                <div className="h-64 animate-pulse rounded bg-muted" />
              </Card>
            ) : peopleError ? (
              <Card title="Audit log">
                <LoadFailure failure={peopleError} onRetry={load} />
              </Card>
            ) : (
              <AuditLogPanel people={people} />
            ))}
        </>
      ) : null}
    </div>
  );
}

function LoadFailure({
  failure,
  onRetry,
}: {
  failure: RequestFailure;
  onRetry: () => Promise<void>;
}) {
  return (
    <div role="alert" className="space-y-3 text-sm text-status-danger">
      <p>{failure.message}</p>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => void onRetry()}
      >
        Retry
      </Button>
    </div>
  );
}
