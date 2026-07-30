"use client";

import React from "react";
import { Badge, Button, Card, DataTable, Input, Label, Select, type ColumnDef } from "@pathway/ui";
import { toast } from "sonner";
import {
  assignRole,
  fetchRoleAssignments,
  revokeRoleAssignment,
  type AdminRoleAssignment,
  type AdminRoleDefinition,
  type PersonRow,
} from "@/lib/api-client";
import { formatAssignmentWindow, parseCodedError } from "@/lib/roles";

export type AssignmentPanelProps = {
  roles: AdminRoleDefinition[];
  people: PersonRow[];
};

function roleName(roles: AdminRoleDefinition[], roleId: string): string {
  return roles.find((r) => r.id === roleId)?.name ?? roleId;
}

function personLabel(people: PersonRow[], userId: string): string {
  const person = people.find((p) => p.id === userId);
  return person ? `${person.name} (${person.email})` : userId;
}

export function AssignmentPanel({ roles, people }: AssignmentPanelProps) {
  const [assignments, setAssignments] = React.useState<AdminRoleAssignment[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [assignUserId, setAssignUserId] = React.useState("");
  const [assignRoleId, setAssignRoleId] = React.useState("");
  const [startsAt, setStartsAt] = React.useState("");
  const [expiresAt, setExpiresAt] = React.useState("");
  const [isAssigning, setIsAssigning] = React.useState(false);
  const [assignError, setAssignError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchRoleAssignments();
      setAssignments(result.items);
      setNextCursor(result.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load assignments");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleLoadMore = async () => {
    if (!nextCursor) return;
    setIsLoadingMore(true);
    try {
      const result = await fetchRoleAssignments({ cursor: nextCursor });
      setAssignments((prev) => [...prev, ...result.items]);
      setNextCursor(result.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more assignments");
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleAssign = async () => {
    setAssignError(null);
    if (!assignUserId || !assignRoleId || !startsAt) {
      setAssignError("Select a person, a role, and a start date.");
      return;
    }
    setIsAssigning(true);
    try {
      await assignRole({
        userId: assignUserId,
        roleDefinitionId: assignRoleId,
        startsAt: new Date(startsAt).toISOString(),
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      });
      toast.success("Role assigned");
      setAssignUserId("");
      setAssignRoleId("");
      setStartsAt("");
      setExpiresAt("");
      await load();
    } catch (err) {
      const { message } = parseCodedError(err);
      setAssignError(message);
    } finally {
      setIsAssigning(false);
    }
  };

  const handleRevoke = async (assignmentId: string) => {
    if (!confirm("Revoke this role assignment?")) return;
    try {
      await revokeRoleAssignment(assignmentId);
      toast.success("Assignment revoked");
      await load();
    } catch (err) {
      const { message } = parseCodedError(err);
      toast.error(message);
    }
  };

  const columns: ColumnDef<AdminRoleAssignment>[] = [
    {
      id: "person",
      header: "Person",
      cell: (row) => <span className="text-sm text-text-primary">{personLabel(people, row.userId)}</span>,
    },
    {
      id: "role",
      header: "Role",
      cell: (row) => <Badge variant="default">{roleName(roles, row.roleDefinitionId)}</Badge>,
      width: "180px",
    },
    {
      id: "window",
      header: "Active window",
      cell: (row) => (
        <span className="text-sm text-text-secondary">
          {formatAssignmentWindow(row.startsAt, row.expiresAt)}
        </span>
      ),
      width: "220px",
    },
    {
      id: "status",
      header: "Status",
      cell: (row) =>
        row.revokedAt ? (
          <Badge variant="secondary">Revoked</Badge>
        ) : (
          <Badge variant="success">Active</Badge>
        ),
      width: "100px",
    },
    {
      id: "actions",
      header: "",
      cell: (row) =>
        row.revokedAt ? null : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleRevoke(row.id)}
            className="border-status-danger/30 text-status-danger hover:bg-status-danger/5"
          >
            Revoke
          </Button>
        ),
      width: "100px",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Card title="Assign a role" description="Grant a role to a person in this organisation">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label htmlFor="assign-person">Person</Label>
            <Select
              id="assign-person"
              value={assignUserId}
              onChange={(e) => setAssignUserId(e.target.value)}
            >
              <option value="">Select a person</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.email})
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="assign-role">Role</Label>
            <Select
              id="assign-role"
              value={assignRoleId}
              onChange={(e) => setAssignRoleId(e.target.value)}
            >
              <option value="">Select a role</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="assign-starts">Starts</Label>
            <Input
              id="assign-starts"
              type="date"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="assign-expires">Expires (optional)</Label>
            <Input
              id="assign-expires"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
        </div>
        {assignError && (
          <p className="mt-2 text-sm text-status-danger">{assignError}</p>
        )}
        <div className="mt-4">
          <Button size="sm" onClick={handleAssign} disabled={isAssigning}>
            {isAssigning ? "Assigning…" : "Assign role"}
          </Button>
        </div>
      </Card>

      <Card title="Assignments">
        {error && (
          <div className="mb-3 rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
            {error}
          </div>
        )}
        {isLoading ? (
          <div className="py-8 text-center text-sm text-text-muted">Loading...</div>
        ) : (
          <>
            <DataTable
              columns={columns}
              data={assignments}
              emptyMessage="No role assignments yet."
            />
            {nextCursor && (
              <div className="mt-3 flex justify-center">
                <Button variant="secondary" size="sm" onClick={handleLoadMore} disabled={isLoadingMore}>
                  {isLoadingMore ? "Loading…" : "Load more"}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
