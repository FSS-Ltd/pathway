"use client";

import React from "react";
import { Select } from "@pathway/ui";

export type RecordFilterOption = {
  id: string;
  label: string;
  detail?: string | null;
};

type RecordFilterProps = {
  label: string;
  allLabel: string;
  options: RecordFilterOption[];
  value: string;
  onChange: (id: string) => void;
  isLoading?: boolean;
};

/** Filters an already-authorised roster by record ID, never by a typed name. */
export function RecordFilter({
  label,
  allLabel,
  options,
  value,
  onChange,
  isLoading = false,
}: RecordFilterProps): React.JSX.Element {
  const optionLabels = options.map((option) =>
    [option.label, option.detail].filter(Boolean).join(" · "),
  );
  const counts = new Map<string, number>();
  optionLabels.forEach((text) => counts.set(text, (counts.get(text) ?? 0) + 1));

  return (
    <label className="flex w-full min-w-0 flex-col gap-1 text-sm font-medium text-text-primary md:max-w-sm">
      {label}
      <Select
        aria-label={label}
        className="min-h-11"
        disabled={isLoading || options.length === 0}
        value={options.some((option) => option.id === value) ? value : ""}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">
          {isLoading
            ? "Loading records…"
            : options.length === 0
              ? "No records available"
              : allLabel}
        </option>
        {!isLoading &&
          options.map((option, index) => (
            <option key={option.id} value={option.id}>
              {optionLabels[index]}
              {(counts.get(optionLabels[index]) ?? 0) > 1
                ? ` · ${option.id}`
                : ""}
            </option>
          ))}
      </Select>
    </label>
  );
}
