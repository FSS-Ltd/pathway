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
} from "@/lib/api-client";
import { parseCodedError } from "@/lib/roles";
import { RoleEditorForm } from "../role-editor-form";

export default function NewRolePage() {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [scope, setScope] = React.useState<"organisation" | "site">("organisation");
  const [permissionKeys, setPermissionKeys] = React.useState<string[]>([]);
  const [delegableKeys, setDelegableKeys] = React.useState<string[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const keys = await fetchDelegablePermissionKeys();
        if (!cancelled) setDelegableKeys(keys);
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
      )}
    </div>
  );
}
