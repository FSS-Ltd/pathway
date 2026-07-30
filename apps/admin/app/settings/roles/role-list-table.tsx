"use client";

import Link from "next/link";
import { Badge, Button, DataTable, type ColumnDef } from "@pathway/ui";
import { toast } from "sonner";
import { cloneRole, retireRole, type AdminRoleDefinition } from "@/lib/api-client";
import { parseCodedError } from "@/lib/roles";

export type RoleListTableProps = {
  roles: AdminRoleDefinition[];
  onChanged: () => void;
};

export function RoleListTable({ roles, onChanged }: RoleListTableProps) {
  async function handleClone(role: AdminRoleDefinition) {
    const name = prompt("Name for the cloned role:", `${role.name} (copy)`);
    if (!name || !name.trim()) return;
    try {
      await cloneRole(role.id, { name: name.trim() });
      toast.success("Role cloned");
      onChanged();
    } catch (err) {
      const { message } = parseCodedError(err);
      toast.error(message);
    }
  }

  async function handleRetire(role: AdminRoleDefinition) {
    if (!confirm(`Retire "${role.name}"? Existing assignments will be revoked.`)) return;
    try {
      await retireRole(role.id, role.version);
      toast.success("Role retired");
      onChanged();
    } catch (err) {
      const { message } = parseCodedError(err);
      toast.error(message);
    }
  }

  const columns: ColumnDef<AdminRoleDefinition>[] = [
    {
      id: "name",
      header: "Name",
      cell: (row) => (
        <div className="flex flex-col">
          <span className="font-semibold text-text-primary">{row.name}</span>
          {row.description && (
            <span className="text-sm text-text-muted">{row.description}</span>
          )}
        </div>
      ),
    },
    {
      id: "scope",
      header: "Scope",
      cell: (row) => (
        <Badge variant={row.scope === "organisation" ? "accent" : "default"}>
          {row.scope === "organisation" ? "Organisation" : "Site"}
        </Badge>
      ),
      width: "140px",
    },
    {
      id: "type",
      header: "Type",
      cell: (row) => (row.isSystem ? <Badge variant="secondary">System</Badge> : null),
      width: "100px",
    },
    {
      id: "permissions",
      header: "Permissions",
      cell: (row) => (
        <span className="text-sm text-text-secondary">{row.permissions.length}</span>
      ),
      width: "110px",
    },
    {
      id: "actions",
      header: "",
      cell: (row) => (
        <div className="flex items-center justify-end gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link href={`/settings/roles/${row.id}/edit`}>Edit</Link>
          </Button>
          <Button variant="secondary" size="sm" onClick={() => handleClone(row)}>
            Clone
          </Button>
          {!row.isSystem && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleRetire(row)}
              className="border-status-danger/30 text-status-danger hover:bg-status-danger/5"
            >
              Retire
            </Button>
          )}
        </div>
      ),
      width: "260px",
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={roles}
      emptyMessage="No custom roles yet. Create one to get started."
    />
  );
}
