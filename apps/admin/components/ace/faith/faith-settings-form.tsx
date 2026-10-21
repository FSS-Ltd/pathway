"use client";

import React from "react";
import { Button, Card, Input, Label } from "@pathway/ui";

export function FaithSettingsForm({
  displayLabel,
  pending,
  onSave,
}: {
  displayLabel: string;
  pending: boolean;
  onSave: (label: string) => Promise<void>;
}) {
  const [label, setLabel] = React.useState(displayLabel);
  React.useEffect(() => setLabel(displayLabel), [displayLabel]);
  return (
    <Card
      title="Site terminology"
      description="Choose the name staff see for this ACE faith space."
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = label.trim();
          if (trimmed && trimmed !== displayLabel && !pending)
            void onSave(trimmed);
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor="faith-display-label">Display name</Label>
          <Input
            id="faith-display-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            minLength={2}
            maxLength={80}
            required
            disabled={pending}
          />
        </div>
        <Button
          type="submit"
          disabled={pending || !label.trim() || label.trim() === displayLabel}
        >
          {pending ? "Saving…" : "Save name"}
        </Button>
      </form>
    </Card>
  );
}
