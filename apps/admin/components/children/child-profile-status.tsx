import * as React from "react";
import Link from "next/link";
import { Button, Card } from "@pathway/ui";

export function ChildProfileStatus({
  state,
  error,
  personLabel,
  onRetry,
}: {
  state: "loading" | "missing" | "error";
  error: string | null;
  personLabel: string;
  onRetry: () => void;
}) {
  if (state === "loading") {
    return (
      <div
        role="status"
        aria-label="Loading record"
        className="grid gap-4 lg:grid-cols-2"
      >
        <Card className="h-44 animate-pulse bg-surface-alt" />
        <Card className="h-44 animate-pulse bg-surface-alt" />
      </div>
    );
  }

  return (
    <Card className="p-6">
      <h1 className="text-xl font-bold text-text-primary">
        {state === "missing"
          ? `${personLabel} not found`
          : "Unable to load record"}
      </h1>
      <p
        className="mt-2 text-sm text-text-muted"
        role={state === "error" ? "alert" : undefined}
      >
        {state === "missing"
          ? "This record is unavailable or has been removed."
          : (error ?? "Please try again.")}
      </p>
      {state === "error" ? (
        <Button className="mt-4" onClick={onRetry}>
          Retry
        </Button>
      ) : (
        <Button asChild className="mt-4" variant="secondary">
          <Link href="/children">Back to list</Link>
        </Button>
      )}
    </Card>
  );
}
