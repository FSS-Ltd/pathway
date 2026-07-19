"use client";

import React from "react";
import { Badge, Button, Card, Label } from "@pathway/ui";
import { VERTICAL_LABELS, type AdminVertical } from "../../lib/api-client";

type VerticalSettingsCardProps = {
  vertical: AdminVertical | null;
  canEdit: boolean;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  previewCapabilities: string[] | null;
  onPreview: (candidate: AdminVertical) => void;
  onSave: (vertical: AdminVertical) => void;
};

const verticalOptions = Object.entries(VERTICAL_LABELS) as Array<
  [AdminVertical, string]
>;

export function VerticalSettingsCard({
  vertical,
  canEdit,
  isLoading,
  isSaving,
  error,
  previewCapabilities,
  onPreview,
  onSave,
}: VerticalSettingsCardProps) {
  const [candidate, setCandidate] = React.useState<AdminVertical | "">(
    vertical ?? "",
  );

  React.useEffect(() => {
    setCandidate(vertical ?? "");
  }, [vertical]);

  const handleCandidateChange = (
    event: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    const nextCandidate = event.target.value as AdminVertical;
    setCandidate(nextCandidate);
    onPreview(nextCandidate);
  };

  const saveDisabled =
    isLoading || isSaving || !canEdit || !candidate || candidate === vertical;

  return (
    <Card
      title="Vertical"
      description="Choose the operating model that determines the organisation's base capabilities."
    >
      {isLoading ? (
        <div className="space-y-2">
          <span className="block h-3 w-40 animate-pulse rounded bg-muted" />
          <span className="block h-9 w-full animate-pulse rounded bg-muted" />
        </div>
      ) : (
        <div className="space-y-4">
          <p className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
            Current vertical
            <Badge variant="secondary">
              {vertical ? VERTICAL_LABELS[vertical] : "Not configured"}
            </Badge>
          </p>

          <div className="space-y-2">
            <Label htmlFor="organisation-vertical">Change vertical</Label>
            <select
              id="organisation-vertical"
              value={candidate}
              disabled={!canEdit || isSaving}
              onChange={handleCandidateChange}
              className="h-10 w-full rounded-md border border-border-subtle bg-surface px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
            >
              <option value="" disabled>
                Select a vertical
              </option>
              {verticalOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {previewCapabilities ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-text-primary">
                Capability preview
              </p>
              {previewCapabilities.length > 0 ? (
                <ul className="space-y-1 text-sm text-text-muted">
                  {previewCapabilities.map((capability) => (
                    <li key={capability}>{capability}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-text-muted">
                  No base capabilities are configured for this vertical.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-text-muted">
              Select a vertical to preview its base capabilities.
            </p>
          )}

          {!canEdit ? (
            <p className="text-sm text-text-muted">
              Organisation owners and admins can change this setting.
            </p>
          ) : null}
          {error ? <p className="text-sm text-status-danger">{error}</p> : null}

          <Button
            size="sm"
            disabled={saveDisabled}
            onClick={() => {
              if (candidate) onSave(candidate);
            }}
          >
            {isSaving ? "Saving…" : "Save vertical"}
          </Button>
        </div>
      )}
    </Card>
  );
}
