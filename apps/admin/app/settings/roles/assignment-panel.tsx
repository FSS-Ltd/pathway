"use client";

import React from "react";
import {
  Badge,
  Button,
  Card,
  DataTable,
  Input,
  Label,
  Select,
  type ColumnDef,
} from "@pathway/ui";
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
import { useCursorPage } from "./use-cursor-page";

export type AssignmentPanelProps = {
  roles: AdminRoleDefinition[];
  people: PersonRow[];
  activeSiteId: string | null;
};

function roleName(roles: AdminRoleDefinition[], roleId: string): string {
  return roles.find((r) => r.id === roleId)?.name ?? roleId;
}

function personLabel(people: PersonRow[], userId: string): string {
  const person = people.find((p) => p.id === userId);
  return person ? `${person.name} (${person.email})` : userId;
}

export function AssignmentPanel({
  roles,
  people,
  activeSiteId,
}: AssignmentPanelProps) {
  const assignableRoles = roles.filter(
    (role) =>
      role.isSystem &&
      role.isActive &&
      (role.scope === "organisation" ||
        (activeSiteId !== null && role.tenantId === activeSiteId)),
  );
  const assignmentsPage = useCursorPage(
    fetchRoleAssignments,
    "Unable to load assignments.",
    activeSiteId,
  );

  const [assignUserId, setAssignUserId] = React.useState("");
  const [assignRoleId, setAssignRoleId] = React.useState("");
  const [startsAt, setStartsAt] = React.useState("");
  const [expiresAt, setExpiresAt] = React.useState("");
  const [isAssigning, setIsAssigning] = React.useState(false);
  const [assignError, setAssignError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setAssignRoleId("");
  }, [activeSiteId]);

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
      assignmentsPage.refresh();
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
      assignmentsPage.refresh();
    } catch (err) {
      const { message } = parseCodedError(err);
      toast.error(message);
    }
  };

  const columns: ColumnDef<AdminRoleAssignment>[] = [
    {
      id: "person",
      header: "Person",
      cell: (row) => (
        <span className="text-sm text-text-primary">
          {personLabel(people, row.userId)}
        </span>
      ),
    },
    {
      id: "role",
      header: "Role",
      cell: (row) => (
        <Badge variant="default">{roleName(roles, row.roleDefinitionId)}</Badge>
      ),
      width: "180px",
      priority: "secondary",
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
      priority: "secondary",
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
      priority: "secondary",
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
      <Card
        title="Assign a fixed role"
        description="Grant a platform role to a person in this organisation"
      >
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
              disabled={assignableRoles.length === 0}
            >
              <option value="">Select a role</option>
              {assignableRoles.map((r) => (
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
        {assignableRoles.length === 0 && (
          <p className="mt-2 text-sm text-text-muted" role="status">
            No fixed roles are available for assignment.
          </p>
        )}
        {assignError && (
          <p className="mt-2 text-sm text-status-danger">{assignError}</p>
        )}
        <div className="mt-4">
          <Button
            size="sm"
            onClick={handleAssign}
            disabled={isAssigning || assignableRoles.length === 0}
          >
            {isAssigning ? "Assigning…" : "Assign role"}
          </Button>
        </div>
      </Card>

      <Card title="Assignments">
        <DataTable
          columns={columns}
          data={assignmentsPage.items}
          caption="Role assignments"
          rowKey={(assignment) => assignment.id}
          isLoading={assignmentsPage.isLoading}
          errorMessage={assignmentsPage.error}
          onRetry={assignmentsPage.refresh}
          emptyMessage="No role assignments yet."
          pagination={{
            mode: "server",
            pageIndex: assignmentsPage.pageIndex,
            pageSize: assignmentsPage.pageSize,
            hasNextPage: assignmentsPage.hasNextPage,
            onPageChange: assignmentsPage.changePage,
            onPageSizeChange: assignmentsPage.changePageSize,
          }}
        />
      </Card>
    </div>
  );
}
