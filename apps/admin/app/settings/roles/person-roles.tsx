"use client";

import React from "react";
import { Button, Label, Select } from "@pathway/ui";
import { assignRole, revokeRoleAssignment } from "@/lib/api-client";
import type { PersonAccess } from "@/lib/roles-access-api";
import { requestFailure } from "@/lib/request-error";
import { RoleInfo } from "./role-info";

export function PersonRoles({
  access,
  siteId,
  canManage,
  onRefresh,
}: {
  access: PersonAccess;
  siteId: string | null;
  canManage: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [selectedRoleId, setSelectedRoleId] = React.useState("");
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const activeRoleIds = new Set(
    access.assignments.map((item) => item.roleDefinitionId),
  );
  const assignable = access.roles.filter(
    (role) =>
      (role.scope === "organisation" && role.tenantId === null) ||
      (role.scope === "site" &&
        role.tenantId === siteId &&
        access.targetInSelectedSite),
  );
  const selectedRole = assignable.find((role) => role.id === selectedRoleId);
  const save = async (operation: () => Promise<unknown>, id: string) => {
    setPendingId(id);
    setError(null);
    try {
      await operation();
      await onRefresh();
      setSelectedRoleId("");
    } catch (failure) {
      setError(requestFailure(failure, "Unable to update this role.").message);
    } finally {
      setPendingId(null);
    }
  };

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-text-primary">
          Assigned fixed roles
        </h3>
        <p className="text-sm text-text-muted">
          Role definitions remain fixed. Assignments can be changed without
          leaving this person.
        </p>
      </div>
      {access.assignments.length === 0 ? (
        <p className="rounded-lg border border-border-subtle px-4 py-5 text-sm text-text-muted">
          No active fixed roles in this scope.
        </p>
      ) : (
        <div className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
          {access.assignments.map((assignment) => {
            const role = access.roles.find(
              (item) => item.id === assignment.roleDefinitionId,
            );
            return (
              <div
                key={assignment.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <span className="inline-flex items-center gap-2 font-medium text-text-primary">
                    {role?.name ?? assignment.roleDefinitionId}
                    {role && <RoleInfo role={role} />}
                  </span>
                  <p className="text-xs text-text-muted">
                    {assignment.tenantId ? "Selected site" : "Organisation"}
                    {assignment.expiresAt
                      ? ` · Ends ${new Date(assignment.expiresAt).toLocaleDateString()}`
                      : ""}
                  </p>
                </div>
                {canManage && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pendingId !== null}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Remove ${role?.name ?? "this role"} from this person?`,
                        )
                      )
                        void save(
                          () => revokeRoleAssignment(assignment.id),
                          assignment.id,
                        );
                    }}
                  >
                    {pendingId === assignment.id ? "Removing…" : "Remove"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
      {canManage && (
        <div className="flex flex-wrap items-end gap-2 border-t border-border-subtle pt-4">
          <div className="min-w-56 flex-1">
            <Label htmlFor="assign-fixed-role">Add a fixed role</Label>
            <Select
              id="assign-fixed-role"
              value={selectedRoleId}
              onChange={(event) => setSelectedRoleId(event.target.value)}
            >
              <option value="">Select a role</option>
              {assignable
                .filter((role) => !activeRoleIds.has(role.id))
                .map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
            </Select>
          </div>
          {selectedRole && <RoleInfo role={selectedRole} />}
          <Button
            disabled={!selectedRoleId || pendingId !== null}
            onClick={() =>
              void save(
                () =>
                  assignRole({
                    userId: access.user.id,
                    roleDefinitionId: selectedRoleId,
                    startsAt: new Date().toISOString(),
                  }),
                selectedRoleId,
              )
            }
          >
            {pendingId === selectedRoleId ? "Adding…" : "Add role"}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-status-danger">
          {error}
        </p>
      )}
    </section>
  );
}
