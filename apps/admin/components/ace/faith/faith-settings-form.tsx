"use client";

import React from "react";
import { Button, Card, Input, Label } from "@pathway/ui";

export function FaithSettingsForm({
  displayLabel,
  reflectionsEnabled,
  reflectionFeatureAvailable,
  pending,
  onSave,
}: {
  displayLabel: string;
  reflectionsEnabled: boolean;
  reflectionFeatureAvailable: boolean;
  pending: boolean;
  onSave: (label: string, reflectionsEnabled: boolean) => Promise<void>;
}) {
  const [label, setLabel] = React.useState(displayLabel);
  const [enabled, setEnabled] = React.useState(reflectionsEnabled);
  React.useEffect(() => setLabel(displayLabel), [displayLabel]);
  React.useEffect(() => setEnabled(reflectionsEnabled), [reflectionsEnabled]);
  const changed =
    label.trim() !== displayLabel || enabled !== reflectionsEnabled;
  return (
    <Card
      title="Site settings"
      description="Choose the name and reflection policy for this ACE faith space."
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = label.trim();
          if (trimmed && changed && !pending) void onSave(trimmed, enabled);
        }}
        className="space-y-4"
      >
        <div className="space-y-1">
          <Label htmlFor="faith-display-label">Display name</Label>
          <Input
            id="faith-display-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            minLength={2}
            maxLength={60}
            required
            disabled={pending}
          />
        </div>
        <div className="space-y-1">
          <label className="flex min-h-11 items-center gap-3 font-medium text-text-primary">
            <input
              type="checkbox"
              checked={enabled}
              disabled={pending || !reflectionFeatureAvailable}
              onChange={(event) => setEnabled(event.target.checked)}
              className="h-5 w-5 accent-accent-strong"
            />
            Allow student reflections
          </label>
          <p className="text-sm text-text-muted">
            Reflections stay private to the student and staff until staff
            approve and release them to linked guardians.
          </p>
          {!reflectionFeatureAvailable ? (
            <p className="text-sm text-text-muted">
              Reflection submissions are not available yet.
            </p>
          ) : null}
        </div>
        <Button type="submit" disabled={pending || !label.trim() || !changed}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </form>
    </Card>
  );
}
