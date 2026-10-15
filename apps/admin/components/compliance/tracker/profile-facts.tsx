"use client";
import React from "react";
import type { TrackerJurisdiction, TrackerProfileInput } from "@pathway/types";
import { fieldClass } from "../agreements/shared";
import { Choice } from "./profile-choice";
const operationalFlags = [
  ["personalDataController", "Acts as a personal data controller"],
  ["employsStaff", "Employs staff"],
  ["controlsPremises", "Controls non-domestic premises"],
  ["foodBusiness", "Confirmed food business"],
  ["operatesVehicles", "Operates its own passenger vehicles"],
] as const;
function isEngland(
  id: string | null,
  jurisdictions: TrackerJurisdiction[],
): boolean {
  const visited = new Set<string>();
  let current = jurisdictions.find((item) => item.id === id);
  while (current && !visited.has(current.id)) {
    if (current.subdivisionCode === "GB-ENG") return true;
    visited.add(current.id);
    const parent = current.parentJurisdictionId;
    current = jurisdictions.find((item) => item.id === parent);
  }
  return false;
}
function FactFlag({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null | undefined;
  onChange: (value: boolean | null) => void;
}) {
  return (
    <label className="block min-w-0">
      {label}
      <select
        className={fieldClass}
        value={value == null ? "unknown" : String(value)}
        onChange={(event) =>
          onChange(
            event.target.value === "unknown"
              ? null
              : event.target.value === "true",
          )
        }
      >
        <option value="unknown">Unknown</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    </label>
  );
}
export function ProfileFacts({
  value,
  setValue,
  jurisdictions,
}: {
  value: TrackerProfileInput;
  setValue: (value: TrackerProfileInput) => void;
  jurisdictions: TrackerJurisdiction[];
}) {
  const england = isEngland(value.jurisdictionId, jurisdictions);
  return (
    <fieldset className="grid min-w-0 gap-4 sm:col-span-2 sm:grid-cols-2">
      <legend className="mb-3 font-medium">Operational facts</legend>
      <p className="text-sm text-text-muted sm:col-span-2">
        Record confirmed facts. Providing food or arranging transport does not
        necessarily mean operating a food business or passenger vehicles. Leave
        uncertain classifications unknown.
      </p>
      {operationalFlags.map(([key, label]) => (
        <FactFlag
          key={key}
          label={label}
          value={value[key]}
          onChange={(next) => setValue({ ...value, [key]: next })}
        />
      ))}
      {england && (
        <>
          <Choice
            label="English school category"
            value={value.schoolCategory ?? null}
            options={["MAINTAINED", "ACADEMY", "INDEPENDENT", "NOT_SCHOOL"]}
            onChange={(next) => setValue({ ...value, schoolCategory: next })}
          />
          <FactFlag
            label="Subject to the Early Years Foundation Stage"
            value={value.eyfsApplies}
            onChange={(next) => setValue({ ...value, eyfsApplies: next })}
          />
          <FactFlag
            label="Subject to English school medical/allergy duties (CFA section 100)"
            value={value.englandSchoolMedicalDutiesApply}
            onChange={(next) =>
              setValue({ ...value, englandSchoolMedicalDutiesApply: next })
            }
          />
          <p className="text-sm text-text-muted sm:col-span-2">
            Confirm the legal section 100 scope, including pupil referral units
            and exclusions for maintained nursery schools, early-years academies
            and 16–19 academies. Do not infer it from the chosen screens or
            ages.
          </p>
          <p className="text-sm text-text-muted sm:col-span-2">
            Use registration records and actual provision to establish these
            English categories. Age alone does not establish an EYFS exemption.
          </p>
        </>
      )}
    </fieldset>
  );
}
