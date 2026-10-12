"use client";

import React from "react";
import {
  Badge,
  DataTable,
  Input,
  Label,
  Select,
  type ColumnDef,
} from "@pathway/ui";
import type {
  BadgeCoverage,
  BadgeMatrix,
  MatrixBadge,
} from "@/lib/roles-access-api";
import { RoleInfo } from "./role-info";

function coverageLabel(coverage: BadgeCoverage): string {
  return coverage === "full"
    ? "Included"
    : coverage === "partial"
      ? "Partial"
      : "—";
}

export function BadgeMatrixPanel({ matrix }: { matrix: BadgeMatrix }) {
  const [search, setSearch] = React.useState("");
  const [selectedRoleId, setSelectedRoleId] = React.useState(
    matrix.roles[0]?.id ?? "",
  );
  const selectedRole =
    matrix.roles.find((role) => role.id === selectedRoleId) ?? matrix.roles[0];
  const rows = matrix.badges.filter((badge) =>
    `${badge.label} ${badge.description} ${badge.permissionKeys.join(" ")}`
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase().trim()),
  );
  const coverage = (badge: MatrixBadge, roleId: string) =>
    badge.roleCoverage.find((entry) => entry.roleId === roleId)?.coverage ??
    "none";
  const columns: ColumnDef<MatrixBadge>[] = [
    {
      id: "badge",
      header: "Badge",
      cell: (badge) => (
        <div className="min-w-44">
          <div className="flex items-center gap-2 font-medium">
            {badge.label}
            {!badge.available && <Badge variant="secondary">Unavailable</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-text-muted">{badge.description}</p>
          <p className="mt-1 text-xs text-text-muted">
            {badge.permissionKeys.length} permissions ·{" "}
            {badge.allowedScopes.join(" / ") || "No scope"}
          </p>
        </div>
      ),
    },
    ...(selectedRole
      ? [
          {
            id: "selected-role",
            header: selectedRole.name,
            cell: (badge: MatrixBadge) =>
              coverageLabel(coverage(badge, selectedRole.id)),
            width: "120px",
          } satisfies ColumnDef<MatrixBadge>,
        ]
      : []),
    ...matrix.roles
      .filter((role) => role.id !== selectedRole?.id)
      .map(
        (role): ColumnDef<MatrixBadge> => ({
          id: role.id,
          header: role.name,
          cell: (badge) => coverageLabel(coverage(badge, role.id)),
          priority: "secondary",
          showInDetails: false,
          width: "120px",
        }),
      ),
  ];

  return (
    <section aria-labelledby="badge-matrix-title" className="space-y-4">
      <div>
        <h2
          id="badge-matrix-title"
          className="font-heading text-xl font-semibold text-text-primary"
        >
          Badge matrix
        </h2>
        <p className="text-sm text-text-muted">
          Every badge and its coverage by fixed role. Partial means the role
          grants only some mapped permissions.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <Label htmlFor="matrix-search">Search badges</Label>
          <Input
            id="matrix-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name, description or permission"
          />
        </div>
        {matrix.roles.length > 0 && (
          <div className="w-full sm:w-56 md:hidden">
            <Label htmlFor="matrix-role">Compare with role</Label>
            <Select
              id="matrix-role"
              value={selectedRole?.id ?? ""}
              onChange={(event) => setSelectedRoleId(event.target.value)}
            >
              {matrix.roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>
      <DataTable
        data={rows}
        columns={columns}
        caption="Badge coverage by fixed role"
        rowKey={(badge) => badge.key}
        pagination={{ mode: "client", resetKey: search }}
        emptyMessage="No badges match this search."
      />
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-text-muted">
        {matrix.roles.map((role) => (
          <span key={role.id} className="inline-flex items-center gap-1.5">
            {role.name} <RoleInfo role={role} />
          </span>
        ))}
      </div>
    </section>
  );
}
