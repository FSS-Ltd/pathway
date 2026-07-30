"use client";

import React from "react";
import { Badge } from "@pathway/ui";
import { Checkbox } from "@/components/ui/checkbox";
import { CAPABILITY_DEFINITIONS, type PermissionKey } from "@pathway/platform/capability-definitions";
import { computePermissionCheckState, groupPermissionsByPrefix, sensitivityBadgeVariant } from "@/lib/roles";

export type PermissionPickerProps = {
  roleScope: "organisation" | "site";
  selectedKeys: string[];
  delegableKeys: string[];
  onChange: (keys: string[]) => void;
};

export function PermissionPicker({
  roleScope,
  selectedKeys,
  delegableKeys,
  onChange,
}: PermissionPickerProps) {
  const delegableSet = React.useMemo(() => new Set(delegableKeys), [delegableKeys]);
  const selectedSet = React.useMemo(() => new Set(selectedKeys), [selectedKeys]);

  const candidateKeys = React.useMemo(
    () =>
      Object.keys(CAPABILITY_DEFINITIONS).filter((key) => {
        const definition = CAPABILITY_DEFINITIONS[key as PermissionKey];
        return (
          definition.scope === roleScope ||
          (roleScope === "organisation" &&
            (definition.scope === "site" ||
              definition.scope === "relationship" ||
              definition.scope === "assignment")) ||
          (roleScope === "site" &&
            (definition.scope === "relationship" || definition.scope === "assignment"))
        );
      }),
    [roleScope],
  );

  const groups = React.useMemo(
    () => groupPermissionsByPrefix(candidateKeys),
    [candidateKeys],
  );

  function toggle(key: string) {
    const next = selectedSet.has(key)
      ? selectedKeys.filter((k) => k !== key)
      : [...selectedKeys, key];
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <div key={group.prefix} className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            {group.prefix}
          </h4>
          <div className="flex flex-col gap-1">
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
                  className={`flex items-start gap-2 rounded border border-border-subtle px-3 py-2 text-sm ${
                    state.disabled ? "opacity-60" : "hover:border-border-strong"
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
        </div>
      ))}
    </div>
  );
}
