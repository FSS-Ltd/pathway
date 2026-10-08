import React from "react";

export function SafeguardingMetrics({
  openConcerns,
  totalNotes,
}: {
  openConcerns: number | null;
  totalNotes: number | null;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-1 md:grid-cols-2">
      <div className="rounded-md border border-border-subtle bg-surface px-3 py-2">
        <p className="text-xs text-text-muted">Open concerns</p>
        <p className="text-lg font-semibold text-text-primary">
          {openConcerns ?? "—"}
        </p>
      </div>
      <div className="rounded-md border border-border-subtle bg-surface px-3 py-2">
        <p className="text-xs text-text-muted">Positive notes (total)</p>
        <p className="text-lg font-semibold text-text-primary">
          {totalNotes ?? "—"}
        </p>
      </div>
    </div>
  );
}
