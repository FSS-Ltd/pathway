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
import type { AccessPerson, MatrixRole } from "@/lib/roles-access-api";
import { RecordFilter } from "@/components/record-filter";
import type { useCursorPage } from "./use-cursor-page";

type DirectoryPage = ReturnType<typeof useCursorPage<AccessPerson>>;

export function PeopleDirectory({
  page,
  roles,
  search,
  onSearchChange,
  roleFilter,
  onRoleFilterChange,
  selectedId,
  onSelect,
}: {
  page: DirectoryPage;
  roles: MatrixRole[];
  search: string;
  onSearchChange: (value: string) => void;
  roleFilter: string;
  onRoleFilterChange: (value: string) => void;
  selectedId: string | null;
  onSelect: (person: AccessPerson | null) => void;
}) {
  const roleNames = new Map(roles.map((role) => [role.id, role.name]));
  const columns: ColumnDef<AccessPerson>[] = [
    {
      id: "person",
      header: "Person",
      cell: (person) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium text-text-primary">
            {person.displayName || person.name || person.email}
            {person.id === selectedId && (
              <span className="ml-1.5 text-xs font-semibold text-accent-primary">
                Selected
              </span>
            )}
          </span>
          <span className="block truncate text-xs text-text-muted">
            {person.email}
          </span>
        </span>
      ),
    },
    {
      id: "roles",
      header: "Fixed roles",
      cell: (person) => (
        <span className="text-xs text-text-secondary">
          {person.roleDefinitionIds
            .map((id) => roleNames.get(id) ?? id)
            .join(", ") || "No fixed role"}
        </span>
      ),
      priority: "secondary",
    },
    {
      id: "status",
      header: "Status",
      cell: (person) => (
        <Badge variant={person.isActive ? "success" : "secondary"}>
          {person.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
      priority: "secondary",
    },
  ];

  return (
    <section
      aria-labelledby="access-people-title"
      className="min-w-0 space-y-3"
    >
      <div>
        <h2
          id="access-people-title"
          className="font-heading text-lg font-semibold text-text-primary"
        >
          People
        </h2>
        <p className="text-xs text-text-muted">
          Select a person to review their access.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
        <div>
          <RecordFilter
            label="Select a person"
            allLabel="Choose from this page"
            options={
              page.error
                ? []
                : page.items.map((person) => ({
                    id: person.id,
                    label: person.displayName || person.name || person.email,
                    detail: person.email,
                  }))
            }
            value={selectedId ?? ""}
            onChange={(id) =>
              onSelect(page.items.find((person) => person.id === id) ?? null)
            }
            isLoading={page.isLoading}
          />
          <p className="mt-1 text-xs text-text-muted">
            Choose from this page. Use the table's page controls below to browse
            more people.
          </p>
        </div>
        <div>
          <Label htmlFor="access-role-filter">Fixed role</Label>
          <Select
            id="access-role-filter"
            value={roleFilter}
            onChange={(event) => onRoleFilterChange(event.target.value)}
          >
            <option value="">All roles</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="sm:col-span-2 xl:col-span-1">
          <Label htmlFor="access-people-search">
            Narrow by name or email (optional)
          </Label>
          <Input
            id="access-people-search"
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Narrow the available people"
          />
        </div>
      </div>
      <DataTable
        data={page.items}
        columns={columns}
        caption="People with access in this organisation"
        rowKey={(person) => person.id}
        onRowClick={onSelect}
        isLoading={page.isLoading}
        errorMessage={page.error}
        onRetry={page.refresh}
        emptyMessage="No people match these filters."
        pagination={{
          mode: "server",
          pageIndex: page.pageIndex,
          pageSize: page.pageSize,
          hasNextPage: page.hasNextPage,
          onPageChange: page.changePage,
          onPageSizeChange: page.changePageSize,
        }}
      />
    </section>
  );
}
