"use client";
import React from "react";
import { fieldClass } from "../agreements/shared";
export function words(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((word) =>
      word === "ace" || word === "icce"
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | null;
  options: readonly T[];
  onChange: (value: T | null) => void;
}) {
  return (
    <label className="block min-w-0">
      {label}
      <select
        className={fieldClass}
        value={value ?? ""}
        onChange={(e) =>
          onChange(options.find((option) => option === e.target.value) ?? null)
        }
      >
        <option value="">Unknown</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {words(option)}
          </option>
        ))}
      </select>
    </label>
  );
}
