"use client";

import { Badge, Card } from "@pathway/ui";
import { Checkbox } from "../../components/ui/checkbox";

type ParentPortalSettingsCardProps = {
  enabled: boolean;
  canEdit: boolean;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  onToggle: (enabled: boolean) => void;
};

export function ParentPortalSettingsCard({
  enabled,
  canEdit,
  isLoading,
  isSaving,
  error,
  onToggle,
}: ParentPortalSettingsCardProps) {
  const disabled = isLoading || isSaving || !canEdit;

  return (
    <Card
      title="Parent portal"
      description="Control whether new child registrations create parent accounts."
    >
      {isLoading ? (
        <div className="space-y-2">
          <span className="block h-3 w-40 animate-pulse rounded bg-muted" />
          <span className="block h-3 w-56 animate-pulse rounded bg-muted" />
        </div>
      ) : (
        <div className="space-y-4">
          <label className="flex items-start gap-3">
            <Checkbox
              checked={enabled}
              disabled={disabled}
              onChange={(event) => onToggle(event.target.checked)}
              aria-describedby="parent-portal-setting-help"
            />
            <span className="space-y-1">
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-text-primary">
                Parent portal enabled
                <Badge variant={enabled ? "success" : "default"}>
                  {enabled ? "On" : "Off"}
                </Badge>
              </span>
              <span
                id="parent-portal-setting-help"
                className="block text-sm text-text-muted"
              >
                {enabled
                  ? "New registrations create parent sign-in access and ask for a password."
                  : "New registrations record guardian details on child profiles only."}
              </span>
            </span>
          </label>
          {!canEdit ? (
            <p className="text-sm text-text-muted">
              Organisation owners and admins can change this setting.
            </p>
          ) : null}
          {isSaving ? (
            <p className="text-sm text-text-muted">Saving setting...</p>
          ) : null}
          {error ? <p className="text-sm text-status-danger">{error}</p> : null}
        </div>
      )}
    </Card>
  );
}
