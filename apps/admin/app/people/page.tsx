"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAdminContext } from "@/lib/admin-context";
import {
  Badge,
  Button,
  Card,
  DataTable,
  Input,
  type ColumnDef,
} from "@pathway/ui";
import {
  fetchPeopleForOrg,
  fetchDeletedPeopleForOrg,
  fetchInvitesForOrg,
  deletePersonFromOrg,
  resendInvite,
  revokeInvite,
  type PersonRow,
  type DeletedPersonRow,
  type InviteRow,
} from "../../lib/api-client";
import { getSafeDisplayName } from "../../lib/names";
import { useAdminAccess } from "../../lib/use-admin-access";
import { canPerform } from "../../lib/permissions";

export default function PeoplePage() {
  const router = useRouter();
  const { state: adminState } = useAdminContext();
  const { role, userId: apiUserId, isLoading: isLoadingAccess } = useAdminAccess();
  const canDeletePeople = role.isOrgAdmin;
  const [people, setPeople] = React.useState<PersonRow[]>([]);
  const [deletedPeople, setDeletedPeople] = React.useState<DeletedPersonRow[]>([]);
  const [invites, setInvites] = React.useState<InviteRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [deletingUserId, setDeletingUserId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);
  const orgId = adminState.status === "ready" ? adminState.snapshot.activeOrgId : null;
  const [searchQuery, setSearchQuery] = React.useState("");
  const [activeTab, setActiveTab] = React.useState<
    "people" | "invites" | "deleted"
  >("people");

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (!orgId) {
        throw new Error("Active organisation not found.");
      }
      const [peopleData, deletedPeopleData, invitesData] = await Promise.all([
        fetchPeopleForOrg(orgId),
        canDeletePeople ? fetchDeletedPeopleForOrg(orgId) : Promise.resolve([]),
        fetchInvitesForOrg(orgId, "pending"),
      ]);
      setPeople(peopleData);
      setDeletedPeople(deletedPeopleData);
      setInvites(invitesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setIsLoading(false);
    }
  }, [canDeletePeople, orgId]);

  React.useEffect(() => {
    if (!orgId) return;
    void load();
  }, [orgId, load]);

  const handleResendInvite = React.useCallback(async (inviteId: string) => {
    try {
      if (!orgId) {
        throw new Error("Active organisation not found.");
      }
      await resendInvite(orgId, inviteId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend invite");
    }
  }, [orgId, load]);

  const handleRevokeInvite = React.useCallback(async (inviteId: string) => {
    if (!confirm("Are you sure you want to revoke this invite?")) return;
    try {
      if (!orgId) {
        throw new Error("Active organisation not found.");
      }
      await revokeInvite(orgId, inviteId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke invite");
    }
  }, [orgId, load]);

  const handleDeletePerson = React.useCallback(async (person: PersonRow) => {
    const displayName = getSafeDisplayName({
      displayName: person.displayName,
      name: person.name,
      email: person.email,
    });
    const confirmed = confirm(
      `Remove ${displayName} from this organisation? They will lose org and site access, but historical records will be kept.`,
    );
    if (!confirmed) return;
    setDeletingUserId(person.id);
    setError(null);
    setSuccessMessage(null);
    try {
      if (!orgId) {
        throw new Error("Active organisation not found.");
      }
      await deletePersonFromOrg(orgId, person.id);
      await load();
      setSuccessMessage(`${displayName} has been moved to deleted users.`);
      setActiveTab("deleted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete person");
    } finally {
      setDeletingUserId(null);
    }
  }, [orgId, load]);

  const filteredPeople = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return people;
    return people.filter(
      (p) => {
        const displayName = getSafeDisplayName({ displayName: p.displayName, name: p.name, email: p.email });
        return (
          displayName.toLowerCase().includes(query) ||
          p.email.toLowerCase().includes(query)
        );
      },
    );
  }, [people, searchQuery]);

  const filteredInvites = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return invites;
    return invites.filter((inv) => inv.email.toLowerCase().includes(query));
  }, [invites, searchQuery]);

  const filteredDeletedPeople = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return deletedPeople;
    return deletedPeople.filter((person) => {
      const displayName = getSafeDisplayName({
        displayName: person.displayName,
        name: person.name,
        email: person.email ?? "",
      });
      return (
        displayName.toLowerCase().includes(query) ||
        (person.email ?? "").toLowerCase().includes(query)
      );
    });
  }, [deletedPeople, searchQuery]);

  const canEditPeople = canPerform("people:edit", role);
  const sessionUserId = apiUserId;
  const currentUserId = sessionUserId || apiUserId || null;

  const peopleColumns = React.useMemo<ColumnDef<PersonRow>[]>(
    () => {
      const cols: ColumnDef<PersonRow>[] = [
        {
          id: "name",
          header: "Name",
          cell: (row) => (
            <div className="flex flex-col">
              <span className="font-semibold text-text-primary">
                {getSafeDisplayName({ displayName: row.displayName, name: row.name, email: row.email })}
              </span>
              <span className="text-sm text-text-muted">{row.email}</span>
            </div>
          ),
        },
        {
          id: "orgRole",
          header: "Org role",
          cell: (row) => (
            <Badge variant="default">{row.orgRole}</Badge>
          ),
          width: "140px",
        },
        {
          id: "siteAccess",
          header: "Site access",
          cell: (row) => (
            <span className="text-sm text-text-secondary">
              {row.siteAccessSummary.allSites
                ? "All sites"
                : `${row.siteAccessSummary.siteCount} site(s)`}
            </span>
          ),
          width: "140px",
        },
      ];
      if (canEditPeople) {
        cols.push({
          id: "actions",
          header: "",
          cell: (row) => {
            const isCurrentUser =
              !!currentUserId && currentUserId === row.id;
            const href = isCurrentUser ? "/staff/profile" : `/people/${row.id}`;
            return (
              <div className="flex items-center justify-end gap-2">
                <Button asChild variant="secondary" size="sm">
                  <Link href={href}>Profile</Link>
                </Button>
                {canDeletePeople && !isCurrentUser && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={deletingUserId === row.id}
                    onClick={() => handleDeletePerson(row)}
                    className="border-status-danger/30 text-status-danger hover:bg-status-danger/5"
                  >
                    {deletingUserId === row.id ? "Deleting..." : "Delete"}
                  </Button>
                )}
              </div>
            );
          },
          width: canDeletePeople ? "180px" : "100px",
        });
      }
      return cols;
    },
    [canDeletePeople, canEditPeople, currentUserId, deletingUserId, handleDeletePerson],
  );

  const inviteColumns = React.useMemo<ColumnDef<InviteRow>[]>(
    () => [
      {
        id: "email",
        header: "Email",
        cell: (row) => (
          <div className="flex flex-col">
            <span className="font-medium text-text-primary">{row.email}</span>
            {row.siteAccessMode && (
              <span className="text-xs text-text-muted">
                {row.siteAccessMode === "ALL_SITES"
                  ? "All sites"
                  : `${row.siteCount} site(s)`}
              </span>
            )}
          </div>
        ),
      },
      {
        id: "role",
        header: "Roles",
        cell: (row) => (
          <div className="flex flex-col gap-1">
            {row.orgRole && <Badge variant="default">{row.orgRole}</Badge>}
            {row.siteRole && <Badge variant="accent">{row.siteRole}</Badge>}
          </div>
        ),
        width: "160px",
      },
      {
        id: "expires",
        header: "Expires",
        cell: (row) => (
          <span className="text-sm text-text-secondary">
            {new Date(row.expiresAt).toLocaleDateString()}
          </span>
        ),
        width: "120px",
      },
      {
        id: "actions",
        header: "Actions",
        cell: (row) => (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleResendInvite(row.id)}
            >
              Resend
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => handleRevokeInvite(row.id)}
            >
              Revoke
            </Button>
          </div>
        ),
        width: "180px",
      },
    ],
    [handleResendInvite, handleRevokeInvite],
  );

  const deletedPeopleColumns = React.useMemo<ColumnDef<DeletedPersonRow>[]>(
    () => [
      {
        id: "name",
        header: "Name",
        cell: (row) => (
          <div className="flex flex-col">
            <span className="font-semibold text-text-primary">
              {getSafeDisplayName({
                displayName: row.displayName,
                name: row.name,
                email: row.email ?? "",
              })}
            </span>
            {row.email && (
              <span className="text-sm text-text-muted">{row.email}</span>
            )}
          </div>
        ),
      },
      {
        id: "priorOrgRole",
        header: "Previous role",
        cell: (row) => (
          <Badge variant="default">{row.priorOrgRole ?? "ORG_MEMBER"}</Badge>
        ),
        width: "150px",
      },
      {
        id: "priorSiteCount",
        header: "Site access",
        cell: (row) => (
          <span className="text-sm text-text-secondary">
            {row.priorSiteCount} site(s)
          </span>
        ),
        width: "140px",
      },
      {
        id: "deletedAt",
        header: "Deleted",
        cell: (row) => (
          <span className="text-sm text-text-secondary">
            {new Date(row.deletedAt).toLocaleDateString()}
          </span>
        ),
        width: "130px",
      },
    ],
    [],
  );

  if (isLoadingAccess) {
    return (
      <div className="flex flex-col gap-4">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-4 w-96 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  const canInvite = canPerform("people:invite", role);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary font-heading">
            People
          </h1>
          <p className="text-sm text-text-muted">
            Manage org members and site access
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={load}>
            Refresh
          </Button>
          {canInvite && (
            <Button size="sm" onClick={() => router.push("/people/invite")}>
              + Invite person
            </Button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="rounded-md border border-status-success/30 bg-status-success/10 px-3 py-2 text-sm text-status-success">
          {successMessage}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-4 border-b border-border pb-0">
        <button
          onClick={() => setActiveTab("people")}
          className={`pb-2 px-1 text-sm font-medium transition-colors border-b-2 ${
            activeTab === "people"
              ? "border-accent text-accent"
              : "border-transparent text-text-muted hover:text-text-primary"
          }`}
        >
          People ({people.length})
        </button>
        <button
          onClick={() => setActiveTab("invites")}
          className={`pb-2 px-1 text-sm font-medium transition-colors border-b-2 ${
            activeTab === "invites"
              ? "border-accent text-accent"
              : "border-transparent text-text-muted hover:text-text-primary"
          }`}
        >
          Pending invites ({invites.length})
        </button>
        {canDeletePeople ? (
          <button
            onClick={() => setActiveTab("deleted")}
            className={`pb-2 px-1 text-sm font-medium transition-colors border-b-2 ${
              activeTab === "deleted"
                ? "border-accent text-accent"
                : "border-transparent text-text-muted hover:text-text-primary"
            }`}
          >
            Deleted users ({deletedPeople.length})
          </button>
        ) : null}
      </div>

      {/* Data Card */}
      <Card
        title={
          activeTab === "people"
            ? "Organisation members"
            : activeTab === "invites"
              ? "Pending invitations"
              : "Deleted users"
        }
        description={
          activeTab === "people"
            ? "Users with access to this organisation and its sites"
            : activeTab === "invites"
              ? "Invitations sent but not yet accepted"
              : "People removed from this organisation"
        }
        actions={
          <Input
            placeholder={`Search ${activeTab}...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-64"
          />
        }
      >
        {isLoading ? (
          <div className="py-8 text-center text-sm text-text-muted">
            Loading...
          </div>
        ) : activeTab === "people" ? (
          <DataTable
            columns={peopleColumns}
            data={filteredPeople}
            emptyMessage="No people found. Invite someone to get started."
          />
        ) : activeTab === "invites" ? (
          <DataTable
            columns={inviteColumns}
            data={filteredInvites}
            emptyMessage="No pending invites."
          />
        ) : (
          <DataTable
            columns={deletedPeopleColumns}
            data={filteredDeletedPeople}
            emptyMessage="No deleted users."
          />
        )}
      </Card>
    </div>
  );
}
