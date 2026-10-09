"use client";

import React from "react";
import { Badge, Button, Card } from "@pathway/ui";
import { setSessionFamilyPublication } from "@/lib/family-timetable-api";

export function FamilyPublicationCard({
  sessionId,
  publishedAt,
  onChanged,
}: {
  sessionId: string;
  publishedAt: string | null;
  onChanged: (value: string | null) => void;
}) {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function changePublication() {
    setPending(true);
    setError(null);
    try {
      onChanged(await setSessionFamilyPublication(sessionId, !publishedAt));
    } catch (cause: unknown) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Publication could not be updated. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Card title="Family timetable">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2" aria-live="polite">
          <Badge variant={publishedAt ? "success" : "default"}>
            {publishedAt ? "Published" : "Private"}
          </Badge>
          <p className="text-sm leading-6 text-text-muted">
            {publishedAt
              ? "Linked families and students can see this session in their timetable."
              : "Publish when the time and group are final. Only linked families and students can see it."}
          </p>
        </div>
        <Button
          type="button"
          variant={publishedAt ? "outline" : "primary"}
          className="min-h-11"
          disabled={pending}
          onClick={() => void changePublication()}
        >
          {pending
            ? "Saving…"
            : publishedAt
              ? "Remove from family timetable"
              : "Publish to family timetable"}
        </Button>
        {error && (
          <p role="alert" className="text-sm text-status-danger">
            {error}
          </p>
        )}
      </div>
    </Card>
  );
}
