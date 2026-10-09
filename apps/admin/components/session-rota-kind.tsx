import React from "react";
import { Badge, Label } from "@pathway/ui";
import type { AdminSessionRotaKind } from "@/lib/api-client";

const kindLabels: Record<AdminSessionRotaKind, string> = {
  STANDARD: "Standard session",
  COVER: "Cover shift",
  MEETING: "Staff meeting",
};

export function SessionRotaKindBadge({
  kind,
}: {
  kind?: AdminSessionRotaKind;
}) {
  if (!kind || kind === "STANDARD") return null;
  return <Badge variant="accent">{kindLabels[kind]}</Badge>;
}

export function SessionRotaKindField({
  value,
  onChange,
  disabled = false,
}: {
  value: AdminSessionRotaKind;
  onChange: (value: AdminSessionRotaKind) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="rotaKind">Purpose</Label>
      <select
        id="rotaKind"
        aria-describedby="rotaKind-help"
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const selected = event.target.value;
          if (
            selected === "STANDARD" ||
            selected === "COVER" ||
            selected === "MEETING"
          ) {
            onChange(selected);
          }
        }}
        className="min-h-11 w-full rounded-md border border-border-subtle bg-surface px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {Object.entries(kindLabels).map(([kind, label]) => (
          <option key={kind} value={kind}>
            {label}
          </option>
        ))}
      </select>
      <p id="rotaKind-help" className="text-xs text-text-muted">
        {disabled
          ? "Purpose is fixed after creation to protect existing attendance and family records."
          : "Cover shifts and meetings appear on staff rotas only. Families will not see them."}
      </p>
    </div>
  );
}
