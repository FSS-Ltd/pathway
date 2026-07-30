"use client";

import { Card, Input, Label, Select, Textarea } from "@pathway/ui";
import { PermissionPicker } from "./permission-picker";

export type RoleEditorFormProps = {
  name: string;
  onNameChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  scope: "organisation" | "site";
  onScopeChange: (value: "organisation" | "site") => void;
  /** Scope cannot change after a role is created (no scope field on the update API). */
  scopeLocked: boolean;
  permissionKeys: string[];
  onPermissionKeysChange: (keys: string[]) => void;
  delegableKeys: string[];
  isSystem?: boolean;
};

export function RoleEditorForm({
  name,
  onNameChange,
  description,
  onDescriptionChange,
  scope,
  onScopeChange,
  scopeLocked,
  permissionKeys,
  onPermissionKeysChange,
  delegableKeys,
  isSystem,
}: RoleEditorFormProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Role details" description="Name and scope for this role">
        <div className="space-y-4">
          {isSystem && (
            <div className="rounded-md border border-border-subtle bg-muted px-3 py-2 text-sm text-text-muted">
              This is a system role and cannot be edited or retired.
            </div>
          )}
          <div>
            <Label htmlFor="role-name">Name</Label>
            <Input
              id="role-name"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="e.g. PACE Coordinator"
              disabled={isSystem}
            />
          </div>
          <div>
            <Label htmlFor="role-description">Description</Label>
            <Textarea
              id="role-description"
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="What this role is for"
              disabled={isSystem}
            />
          </div>
          <div>
            <Label htmlFor="role-scope">Scope</Label>
            <Select
              id="role-scope"
              value={scope}
              onChange={(e) => onScopeChange(e.target.value as "organisation" | "site")}
              disabled={scopeLocked || isSystem}
            >
              <option value="organisation">Organisation-wide</option>
              <option value="site">This site only</option>
            </Select>
            {scopeLocked && (
              <p className="mt-1 text-xs text-text-muted">
                Scope cannot be changed after a role is created.
              </p>
            )}
          </div>
        </div>
      </Card>

      <Card
        title="Permissions"
        description="Only permissions you can delegate are selectable"
      >
        <PermissionPicker
          roleScope={scope}
          selectedKeys={permissionKeys}
          delegableKeys={delegableKeys}
          onChange={onPermissionKeysChange}
        />
      </Card>
    </div>
  );
}
