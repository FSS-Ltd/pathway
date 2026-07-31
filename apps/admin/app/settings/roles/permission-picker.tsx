"use client";

import React from "react";
import { ChevronDown } from "lucide-react";
import { Badge, Input } from "@pathway/ui";
import { Checkbox } from "@/components/ui/checkbox";
import { CAPABILITY_DEFINITIONS, type PermissionKey } from "@pathway/platform/capability-definitions";
import {
  computePermissionCheckState,
  filterPermissionsBySearch,
  groupPermissionsByPrefix,
  partitionCorePermissions,
  selectablePermissionKeys,
  sensitivityBadgeVariant,
} from "@/lib/roles";

export type PermissionPickerProps = {
  roleScope: "organisation" | "site";
  selectedKeys: string[];
  delegableKeys: string[];
  onChange: (keys: string[]) => void;
};

function titleCase(prefix: string): string {
  return prefix.length === 0 ? prefix : prefix[0].toUpperCase() + prefix.slice(1);
}

export function PermissionPicker({
  roleScope,
  selectedKeys,
  delegableKeys,
  onChange,
}: PermissionPickerProps) {
  const [query, setQuery] = React.useState("");
  const [openGroups, setOpenGroups] = React.useState<Set<string>>(new Set());

  const delegableSet = React.useMemo(() => new Set(delegableKeys), [delegableKeys]);
  const selectedSet = React.useMemo(() => new Set(selectedKeys), [selectedKeys]);

  // What's grantable: the actor's delegable set, unioned with whatever is
  // already selected so an edit page never hides a key it will still submit.
  const allSelectableKeys = React.useMemo(
    () => selectablePermissionKeys(roleScope, delegableKeys, selectedKeys),
    [roleScope, delegableKeys, selectedKeys],
  );

  const visibleKeys = React.useMemo(
    () => filterPermissionsBySearch(allSelectableKeys, query),
    [allSelectableKeys, query],
  );

  const { core, sector } = React.useMemo(
    () => partitionCorePermissions(visibleKeys),
    [visibleKeys],
  );

  const isSearching = query.trim().length > 0;

  function toggle(key: string) {
    const next = selectedSet.has(key)
      ? selectedKeys.filter((k) => k !== key)
      : [...selectedKeys, key];
    onChange(next);
  }

  function toggleGroup(groupId: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  function renderSection(title: string, keys: string[], sectionId: string) {
    if (keys.length === 0) return null;
    const groups = groupPermissionsByPrefix(keys);
    return (
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
          {title}
        </h3>
        {groups.map((group) => {
          const groupId = `${sectionId}-${group.prefix}`;
          const selectedCount = group.keys.filter((key) => selectedSet.has(key)).length;
          const isOpen = isSearching || selectedCount > 0 || openGroups.has(groupId);
          const panelId = `permission-group-${groupId}`;
          return (
            <div key={groupId} className="rounded border border-border-subtle">
              <button
                type="button"
                onClick={() => toggleGroup(groupId)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-text-primary hover:bg-muted"
              >
                <span>{titleCase(group.prefix)}</span>
                <span className="flex items-center gap-2 text-xs text-text-muted">
                  {selectedCount} / {group.keys.length}
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}`}
                  />
                </span>
              </button>
              {isOpen && (
                <div id={panelId} className="flex flex-col gap-1 border-t border-border-subtle p-2">
                  {group.keys.map((key) => {
                    const definition = CAPABILITY_DEFINITIONS[key as PermissionKey];
                    const state = computePermissionCheckState(
                      definition.delegable,
                      delegableSet.has(key),
                      selectedSet.has(key),
                    );
                    return (
                      <label
                        key={key}
                        className={`flex items-start gap-2 rounded px-2 py-1.5 text-sm ${
                          state.disabled ? "opacity-60" : "hover:bg-muted"
                        }`}
                        title={state.reason}
                      >
                        <Checkbox
                          checked={state.checked}
                          disabled={state.disabled}
                          onChange={() => toggle(key)}
                        />
                        <span className="flex flex-1 flex-col">
                          <span className="flex items-center gap-2">
                            <span className="font-medium text-text-primary">
                              {definition.label}
                            </span>
                            {definition.sensitivity !== "standard" && (
                              <Badge variant={sensitivityBadgeVariant(definition.sensitivity)}>
                                {definition.sensitivity}
                              </Badge>
                            )}
                          </span>
                          <span className="text-xs text-text-muted">
                            {definition.description}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Input
          type="search"
          placeholder="Search permissions..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <p className="mt-1 text-xs text-text-muted">
          {visibleKeys.length} of {allSelectableKeys.length} permissions
        </p>
      </div>
      {renderSection("Core — every organisation", core, "core")}
      {renderSection("Your sector and modules", sector, "sector")}
      {allSelectableKeys.length === 0 && (
        <p className="text-sm text-text-muted">
          No permissions are available to delegate for this organisation yet.
        </p>
      )}
    </div>
  );
}
