"use client";

import React from "react";
import { Badge, Card, Label, Select } from "@pathway/ui";
import { CAPABILITY_DEFINITIONS, type PermissionKey } from "@pathway/platform/capability-definitions";
import {
  fetchEffectivePermissions,
  type AdminEffectivePermission,
  type AdminRoleDefinition,
  type PersonRow,
} from "@/lib/api-client";
import { groupPermissionsByPrefix, sensitivityBadgeVariant } from "@/lib/roles";

export type EffectiveAccessPanelProps = {
  roles: AdminRoleDefinition[];
  people: PersonRow[];
};

function roleNames(roles: AdminRoleDefinition[], roleIds: string[]): string {
  return roleIds
    .map((id) => roles.find((r) => r.id === id)?.name ?? id)
    .join(", ");
}

export function EffectiveAccessPanel({ roles, people }: EffectiveAccessPanelProps) {
  const [userId, setUserId] = React.useState("");
  const [permissions, setPermissions] = React.useState<AdminEffectivePermission[] | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!userId) {
      setPermissions(null);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchEffectivePermissions(userId)
      .then((result) => {
        if (!cancelled) setPermissions(result.permissions);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load effective access");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const groups = React.useMemo(
    () => groupPermissionsByPrefix((permissions ?? []).map((p) => p.permissionKey)),
    [permissions],
  );

  return (
    <Card
      title="Effective access preview"
      description="What a person can actually do, and which role granted it"
    >
      <div className="rounded-md border border-border-subtle bg-muted px-3 py-2 text-xs text-text-muted">
        Reflects granted roles; some entries may not appear until platform feature
        availability is fully configured for this environment.
      </div>

      <div className="mt-4 max-w-sm">
        <Label htmlFor="effective-access-person">Person</Label>
        <Select
          id="effective-access-person"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        >
          <option value="">Select a person</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.email})
            </option>
          ))}
        </Select>
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="mt-4 py-4 text-center text-sm text-text-muted">Loading...</div>
      )}

      {!isLoading && userId && permissions && permissions.length === 0 && (
        <p className="mt-4 text-sm text-text-muted">
          No effective permissions found for this person.
        </p>
      )}

      {!isLoading && permissions && permissions.length > 0 && (
        <div className="mt-4 flex flex-col gap-4">
          {groups.map((group) => (
            <div key={group.prefix} className="flex flex-col gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                {group.prefix}
              </h4>
              {group.keys.map((key) => {
                const entry = permissions.find((p) => p.permissionKey === key);
                const definition = CAPABILITY_DEFINITIONS[key as PermissionKey];
                return (
                  <div
                    key={key}
                    className="flex flex-col gap-1 rounded border border-border-subtle px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-text-primary">
                        {definition?.label ?? key}
                      </span>
                      {definition && definition.sensitivity !== "standard" && (
                        <Badge variant={sensitivityBadgeVariant(definition.sensitivity)}>
                          {definition.sensitivity}
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-text-muted">
                      Granted via: {roleNames(roles, entry?.sourceRoleIds ?? [])}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
