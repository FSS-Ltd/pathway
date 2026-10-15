import React from "react";
import type { MedicalField } from "@pathway/types";
import {
  readableMedicalField,
  readableMedicalValues,
  hasUnavailableMedical,
  type MedicalValues,
} from "@/lib/medical-read";
export type { MedicalValues } from "@/lib/medical-read";
import { fieldClass } from "./record-fields";
export const MEDICAL_FIELDS = [
  ["allergies", "Allergies"],
  ["medicalConditions", "Medical conditions"],
  ["medicationAtSite", "Medication at site"],
] as const;
export function medicalText(field: MedicalField): string {
  field = readableMedicalField(field);
  if (field.status === "UNAVAILABLE")
    return "Unavailable — information could not be read";
  return field.status === "RECORDED"
    ? field.details
    : field.status === "NONE"
      ? "None confirmed"
      : "Unknown / not confirmed";
}
export function MedicalSummary({ value }: { value: MedicalValues }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-3">
      {MEDICAL_FIELDS.map(([key, label]) => (
        <div key={key} className="min-w-0">
          <dt className="text-sm font-medium text-text-muted">{label}</dt>
          <dd className="mt-1 whitespace-pre-wrap break-words text-sm">
            {medicalText(value[key])}
          </dd>
        </div>
      ))}
    </dl>
  );
}
export function MedicalFields({
  value,
  onChange,
  disabled,
}: {
  value: MedicalValues;
  onChange: (value: MedicalValues) => void;
  disabled: boolean;
}) {
  value = readableMedicalValues(value);
  return (
    <fieldset
      disabled={disabled || hasUnavailableMedical(value)}
      className="min-w-0 space-y-5"
    >
      {MEDICAL_FIELDS.map(([key, label]) => (
        <div key={key} className="space-y-2">
          <label
            className="block text-sm font-medium"
            htmlFor={`medical-${key}`}
          >
            {label}
          </label>
          <select
            id={`medical-${key}`}
            className={fieldClass}
            value={value[key].status}
            onChange={(event) => {
              const status = event.target.value;
              if (status === "UNKNOWN" || status === "NONE")
                onChange({ ...value, [key]: { status, details: null } });
              else if (status === "RECORDED")
                onChange({ ...value, [key]: { status, details: "" } });
            }}
          >
            {value[key].status === "UNAVAILABLE" && (
              <option value="UNAVAILABLE">Unavailable</option>
            )}
            <option value="UNKNOWN">Unknown</option>
            <option value="NONE">None</option>
            <option value="RECORDED">Recorded</option>
          </select>
          {value[key].status === "RECORDED" && (
            <label className="block text-sm">
              {label} details *
              <textarea
                className={fieldClass}
                required
                maxLength={5000}
                rows={3}
                value={value[key].details ?? ""}
                onChange={(event) =>
                  onChange({
                    ...value,
                    [key]: { status: "RECORDED", details: event.target.value },
                  })
                }
              />
            </label>
          )}
        </div>
      ))}
    </fieldset>
  );
}
