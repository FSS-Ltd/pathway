"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button, Card } from "@pathway/ui";
import { toast } from "sonner";
import {
  createRole,
  fetchDelegablePermissionKeys,
  fetchRoles,
} from "@/lib/api-client";
import { parseCodedError, selectablePermissionKeys } from "@/lib/roles";
import { RoleEditorForm } from "../role-editor-form";
import { RoleTemplatePicker, type RoleTemplate } from "../role-template-picker";

export default function NewRolePage() {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [scope, setScope] = React.useState<"organisation" | "site">("organisation");
  const [permissionKeys, setPermissionKeys] = React.useState<string[]>([]);
  const [delegableKeys, setDelegableKeys] = React.useState<string[]>([]);
  const [templates, setTemplates] = React.useState<RoleTemplate[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [keys, roles] = await Promise.all([
          fetchDelegablePermissionKeys(),
          fetchRoles(),
        ]);
        if (cancelled) return;
        setDelegableKeys(keys);
        // Site-scoped system roles exist once per site; the same template
        // name always carries the same org-derived permissions, so the
        // first occurrence is enough.
        const seen = new Set<string>();
        const roleTemplates: RoleTemplate[] = [];
        for (const role of roles) {
          if (!role.isSystem || seen.has(role.name)) continue;
          seen.add(role.name);
          roleTemplates.push({
            name: role.name,
            permissionKeys: role.permissions.map((p) => p.permissionKey),
          });
        }
        setTemplates(roleTemplates);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load delegable permissions");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleApplyTemplate = (templatePermissionKeys: string[]) => {
    const selectable = new Set(selectablePermissionKeys(scope, delegableKeys));
    const applied = templatePermissionKeys.filter((key) => selectable.has(key));
    const dropped = templatePermissionKeys.length - applied.length;
    setPermissionKeys(applied);
    toast.success(
      dropped > 0
        ? `Prefilled ${applied.length} of ${templatePermissionKeys.length} permissions — ${dropped} aren't available to your organisation.`
        : `Prefilled ${applied.length} permission${applied.length === 1 ? "" : "s"}.`,
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const role = await createRole({
        name: name.trim(),
        description: description.trim() || undefined,
        scope,
        permissionKeys,
      });
      toast.success("Role created");
      router.push(`/settings/roles/${role.id}/edit`);
    } catch (err) {
      const { message } = parseCodedError(err);
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Button asChild variant="secondary" size="sm">
          <Link href="/settings/roles" className="inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to roles
          </Link>
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isSaving || isLoading || !name.trim() || permissionKeys.length === 0}
        >
          {isSaving ? "Creating…" : "Create role"}
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
          {error}
        </div>
      )}

      {isLoading ? (
        <Card>
          <div className="h-64 animate-pulse rounded bg-muted" />
        </Card>
      ) : (
        <>
          {templates.length > 0 && (
            <RoleTemplatePicker templates={templates} onApply={handleApplyTemplate} />
          )}
          <RoleEditorForm
            name={name}
            onNameChange={setName}
            description={description}
            onDescriptionChange={setDescription}
            scope={scope}
            onScopeChange={setScope}
            scopeLocked={false}
            permissionKeys={permissionKeys}
            onPermissionKeysChange={setPermissionKeys}
            delegableKeys={delegableKeys}
          />
        </>
      )}
    </div>
  );
}
