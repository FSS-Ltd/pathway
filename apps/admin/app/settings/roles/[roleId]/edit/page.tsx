"use client";

import React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button, Card } from "@pathway/ui";
import { toast } from "sonner";
import {
  fetchDelegablePermissionKeys,
  fetchRole,
  retireRole,
  updateRole,
  type AdminRoleDefinition,
} from "@/lib/api-client";
import { parseCodedError } from "@/lib/roles";
import { RoleEditorForm } from "../../role-editor-form";

export default function EditRolePage() {
  const params = useParams<{ roleId: string }>();
  const router = useRouter();
  const roleId = params.roleId;

  const [role, setRole] = React.useState<AdminRoleDefinition | null>(null);
  const [delegableKeys, setDelegableKeys] = React.useState<string[]>([]);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [scope, setScope] = React.useState<"organisation" | "site">("organisation");
  const [permissionKeys, setPermissionKeys] = React.useState<string[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isRetiring, setIsRetiring] = React.useState(false);
  const [notFound, setNotFound] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [versionConflict, setVersionConflict] = React.useState(false);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setNotFound(false);
    setVersionConflict(false);
    try {
      const [roleData, keys] = await Promise.all([
        fetchRole(roleId),
        fetchDelegablePermissionKeys(),
      ]);
      if (!roleData) {
        setNotFound(true);
        setRole(null);
      } else {
        setRole(roleData);
        setName(roleData.name);
        setDescription(roleData.description ?? "");
        setScope(roleData.scope);
        setPermissionKeys(roleData.permissions.map((p) => p.permissionKey));
      }
      setDelegableKeys(keys);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load role");
    } finally {
      setIsLoading(false);
    }
  }, [roleId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    if (!role) return;
    setIsSaving(true);
    setError(null);
    setVersionConflict(false);
    try {
      const updated = await updateRole(roleId, {
        expectedVersion: role.version,
        name: name.trim(),
        description: description.trim() || undefined,
        permissionKeys,
      });
      setRole(updated);
      toast.success("Role saved");
    } catch (err) {
      const { code, message } = parseCodedError(err);
      if (code === "ROLE_VERSION_CONFLICT") {
        setVersionConflict(true);
      } else {
        setError(message);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleRetire = async () => {
    if (!role) return;
    if (!confirm(`Retire "${role.name}"? Existing assignments will be revoked.`)) return;
    setIsRetiring(true);
    setError(null);
    try {
      await retireRole(roleId, role.version);
      toast.success("Role retired");
      router.push("/settings/roles");
    } catch (err) {
      const { code, message } = parseCodedError(err);
      if (code === "ROLE_VERSION_CONFLICT") {
        setVersionConflict(true);
      } else {
        setError(message);
      }
    } finally {
      setIsRetiring(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Button asChild variant="secondary" size="sm">
          <Link href="/settings/roles" className="inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </Button>
        <Card>
          <div className="h-64 animate-pulse rounded bg-muted" />
        </Card>
      </div>
    );
  }

  if (notFound || !role) {
    return (
      <div className="flex flex-col gap-4">
        <Button asChild variant="secondary" size="sm">
          <Link href="/settings/roles" className="inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to roles
          </Link>
        </Button>
        <Card title="Role not found">
          <p className="text-sm text-text-muted">
            This role doesn&apos;t exist or you don&apos;t have access to it.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Button asChild variant="secondary" size="sm">
          <Link href="/settings/roles" className="inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to roles
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          {!role.isSystem && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRetire}
              disabled={isRetiring || isSaving}
              className="border-status-danger/30 text-status-danger hover:bg-status-danger/5"
            >
              {isRetiring ? "Retiring…" : "Retire role"}
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={isSaving || isRetiring || role.isSystem}>
            {isSaving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      {versionConflict && (
        <div className="flex items-center justify-between rounded-md border border-status-warn/30 bg-status-warn/10 px-3 py-2 text-sm text-status-warn">
          <span>This role was changed by another request since you loaded it.</span>
          <Button size="sm" variant="secondary" onClick={load}>
            Reload
          </Button>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
          {error}
        </div>
      )}

      <RoleEditorForm
        name={name}
        onNameChange={setName}
        description={description}
        onDescriptionChange={setDescription}
        scope={scope}
        onScopeChange={setScope}
        scopeLocked
        permissionKeys={permissionKeys}
        onPermissionKeysChange={setPermissionKeys}
        delegableKeys={delegableKeys}
        isSystem={role.isSystem}
      />
    </div>
  );
}
