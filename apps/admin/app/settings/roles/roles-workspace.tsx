"use client";

import React from "react";
import { Button } from "@pathway/ui";
import { useAdminContext } from "@/lib/admin-context";
import { hasPermission } from "@/lib/access";
import { useAdminAccess } from "@/lib/use-admin-access";
import { requestFailure } from "@/lib/request-error";
import { NoAccessCard } from "@/components/no-access-card";
import {
  fetchAccessDirectory,
  fetchBadgeMatrix,
  fetchPersonAccess,
  type AccessPerson,
  type BadgeMatrix,
  type PersonAccess,
} from "@/lib/roles-access-api";
import { useCursorPage } from "./use-cursor-page";
import { PeopleDirectory } from "./people-directory";
import { PersonProfile, type PersonTab } from "./person-profile";
import { BadgeMatrixPanel } from "./badge-matrix-panel";
import { AuditLogPanel } from "./audit-log-panel";

type WorkspaceTab = "people" | "matrix" | "audit";
const tabs: Array<{ id: WorkspaceTab; label: string }> = [
  { id: "people", label: "People" },
  { id: "matrix", label: "Badge matrix" },
  { id: "audit", label: "Audit" },
];

export default function RolesWorkspace() {
  const { state: adminState } = useAdminContext();
  const { permissions, isLoading: isLoadingAccess } = useAdminAccess();
  const snapshot = adminState.status === "ready" ? adminState.snapshot : null;
  const canReadPeople =
    permissions !== null &&
    hasPermission(permissions, "platform.access.users.read");
  const canReadMatrix =
    permissions !== null &&
    hasPermission(permissions, "platform.access.permissions.read");
  const canManageRoles =
    permissions !== null &&
    hasPermission(permissions, "platform.access.assignments.manage");
  const [activeTab, setActiveTab] = React.useState<WorkspaceTab>("people");
  const [personTab, setPersonTab] = React.useState<PersonTab>("profile");
  const [search, setSearch] = React.useState("");
  const [roleFilter, setRoleFilter] = React.useState("");
  const [selected, setSelected] = React.useState<AccessPerson | null>(null);
  const [matrix, setMatrix] = React.useState<BadgeMatrix | null>(null);
  const [matrixError, setMatrixError] = React.useState<string | null>(null);
  const [access, setAccess] = React.useState<PersonAccess | null>(null);
  const [accessError, setAccessError] = React.useState<string | null>(null);
  const [loadingPerson, setLoadingPerson] = React.useState(false);
  const accessRequest = React.useRef(0);

  const loadDirectory = React.useCallback(
    (params: { cursor?: string; limit: number }) =>
      !snapshot || !canReadPeople
        ? Promise.resolve({ items: [] as AccessPerson[], nextCursor: null })
        : fetchAccessDirectory({
            ...params,
            search: search.trim() || undefined,
            roleDefinitionId: roleFilter || undefined,
          }),
    [
      snapshot?.activeOrgId,
      snapshot?.activeSiteId,
      canReadPeople,
      search,
      roleFilter,
    ],
  );
  const directory = useCursorPage(
    loadDirectory,
    "Unable to load people.",
    `${snapshot?.activeOrgId ?? ""}:${snapshot?.activeSiteId ?? ""}:${search}:${roleFilter}`,
  );

  const loadMatrix = React.useCallback(async () => {
    if (!snapshot || !canReadMatrix) return;
    setMatrixError(null);
    try {
      setMatrix(await fetchBadgeMatrix());
    } catch (failure) {
      setMatrixError(
        requestFailure(failure, "Unable to load the badge matrix.").message,
      );
    }
  }, [snapshot?.activeOrgId, snapshot?.activeSiteId, canReadMatrix]);

  React.useEffect(() => {
    void loadMatrix();
  }, [loadMatrix]);

  const loadPerson = React.useCallback(async (): Promise<boolean> => {
    if (!selected || !snapshot || !canReadPeople) return false;
    const version = ++accessRequest.current;
    setLoadingPerson(true);
    setAccessError(null);
    try {
      const next = await fetchPersonAccess(selected.id);
      if (version === accessRequest.current) setAccess(next);
      return version === accessRequest.current;
    } catch (failure) {
      if (version === accessRequest.current)
        setAccessError(
          requestFailure(failure, "Unable to load this person's access.")
            .message,
        );
      return false;
    } finally {
      if (version === accessRequest.current) setLoadingPerson(false);
    }
  }, [
    selected?.id,
    snapshot?.activeOrgId,
    snapshot?.activeSiteId,
    canReadPeople,
  ]);

  React.useEffect(() => {
    setAccess(null);
    void loadPerson();
    return () => {
      accessRequest.current += 1;
    };
  }, [loadPerson]);

  if (isLoadingAccess || adminState.status === "loading") {
    return (
      <div
        role="status"
        className="rounded-lg border border-border-subtle p-8 text-sm text-text-muted"
      >
        Loading Roles & Access…
      </div>
    );
  }
  if (!canReadPeople) {
    return (
      <NoAccessCard
        title="You don't have access to Roles & Access"
        message="You need permission to read organisation access records."
      />
    );
  }

  const siteName =
    snapshot?.sites.find((site) => site.id === snapshot.activeSiteId)?.name ??
    null;
  const orgName = snapshot?.org.name ?? "Organisation";
  const selectPerson = (person: AccessPerson | null) => {
    if (selected?.id !== person?.id) setPersonTab("profile");
    setSelected(person);
  };
  const refresh = () => {
    directory.refresh();
    void loadMatrix();
    void loadPerson();
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-text-primary">
            Roles & Access
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Review people, fixed roles, badges and access history.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={refresh}>
          Refresh
        </Button>
      </header>

      <div
        role="tablist"
        aria-label="Roles and access views"
        className="flex gap-1 border-b border-border-subtle"
      >
        {tabs.map((item) => (
          <button
            key={item.id}
            id={`access-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === item.id}
            aria-controls={`access-panel-${item.id}`}
            tabIndex={activeTab === item.id ? 0 : -1}
            onClick={() => setActiveTab(item.id)}
            onKeyDown={(event) => {
              const direction =
                event.key === "ArrowRight"
                  ? 1
                  : event.key === "ArrowLeft"
                    ? -1
                    : 0;
              if (!direction) return;
              event.preventDefault();
              const index = tabs.findIndex((entry) => entry.id === activeTab);
              const next =
                tabs[(index + direction + tabs.length) % tabs.length];
              if (next) {
                setActiveTab(next.id);
                document.getElementById(`access-tab-${next.id}`)?.focus();
              }
            }}
            className="rounded-t-md border-b-2 border-transparent px-4 py-2 text-sm font-medium text-text-muted hover:text-text-primary aria-selected:border-accent-primary aria-selected:text-accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-info"
          >
            {item.label}
          </button>
        ))}
      </div>

      {tabs
        .filter((item) => item.id !== activeTab)
        .map((item) => (
          <div
            key={item.id}
            id={`access-panel-${item.id}`}
            role="tabpanel"
            aria-labelledby={`access-tab-${item.id}`}
            hidden
          />
        ))}
      <div
        id={`access-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`access-tab-${activeTab}`}
      >
        {activeTab === "people" && (
          <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.6fr)]">
            <div className={selected ? "hidden lg:block" : "block"}>
              <PeopleDirectory
                page={directory}
                roles={matrix?.roles ?? []}
                search={search}
                onSearchChange={setSearch}
                roleFilter={roleFilter}
                onRoleFilterChange={setRoleFilter}
                selectedId={selected?.id ?? null}
                onSelect={selectPerson}
              />
            </div>
            <div className={!selected ? "hidden lg:block" : "block"}>
              {!selected ? (
                <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed border-border-subtle text-sm text-text-muted">
                  Select a person to view their profile and access.
                </div>
              ) : loadingPerson && !access ? (
                <div
                  role="status"
                  className="rounded-xl border border-border-subtle p-8 text-sm text-text-muted"
                >
                  Loading{" "}
                  {selected.displayName || selected.name || selected.email}…
                </div>
              ) : accessError ? (
                <div
                  role="alert"
                  className="rounded-xl border border-status-danger/30 p-5 text-sm text-status-danger"
                >
                  {accessError}{" "}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void loadPerson()}
                  >
                    Retry
                  </Button>
                </div>
              ) : access ? (
                <PersonProfile
                  person={selected}
                  access={access}
                  tab={personTab}
                  onTabChange={setPersonTab}
                  onBack={() => setSelected(null)}
                  onRefresh={async () => {
                    if (!(await loadPerson())) {
                      throw new Error(
                        "Access changed, but its current state could not be loaded. Refresh and try again.",
                      );
                    }
                    directory.refresh();
                  }}
                  orgName={orgName}
                  siteId={snapshot?.activeSiteId ?? null}
                  siteName={siteName}
                  canManageRoles={canManageRoles}
                />
              ) : null}
            </div>
          </div>
        )}
        {activeTab === "matrix" &&
          (!canReadMatrix ? (
            <p role="status" className="text-sm text-text-muted">
              You do not have permission to view the badge matrix.
            </p>
          ) : matrixError ? (
            <div role="alert" className="text-sm text-status-danger">
              {matrixError}{" "}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void loadMatrix()}
              >
                Retry
              </Button>
            </div>
          ) : matrix ? (
            <BadgeMatrixPanel matrix={matrix} />
          ) : (
            <p role="status" className="text-sm text-text-muted">
              Loading badge matrix…
            </p>
          ))}
        {activeTab === "audit" && <AuditLogPanel people={directory.items} />}
      </div>
    </div>
  );
}
