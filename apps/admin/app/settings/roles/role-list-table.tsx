"use client";

import { Badge, DataTable, type ColumnDef } from "@pathway/ui";
import type { AdminRoleDefinition } from "@/lib/api-client";

export type RoleListTableProps = {
  roles: AdminRoleDefinition[];
};

export function RoleListTable({ roles }: RoleListTableProps) {
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
      cell: (row) => (
        <Badge variant={row.isSystem ? "secondary" : "default"}>
          {row.isSystem ? "Fixed" : "Legacy"}
        </Badge>
      ),
      width: "110px",
    },
    {
      id: "permissions",
      header: "Permissions",
      cell: (row) => (
        <span className="text-sm text-text-secondary">
          {row.permissions.length}
        </span>
      ),
      width: "110px",
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={roles}
      emptyMessage="No role definitions are available."
    />
  );
}
