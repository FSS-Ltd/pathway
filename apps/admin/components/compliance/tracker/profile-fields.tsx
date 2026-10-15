"use client";
import React from "react";
import {
  INSTITUTIONAL_VERTICALS,
  institutionalSector,
  SECTOR_OPTIONS,
} from "@pathway/types";
import type { TrackerProfileInput, TrackerJurisdiction } from "@pathway/types";
import { Choice, words } from "./profile-choice";
export { words } from "./profile-choice";
import { ProfileFacts } from "./profile-facts";
import { fieldClass } from "../agreements/shared";
export const emptyProfile: TrackerProfileInput = {
  jurisdictionId: null,
  region: null,
  localAuthority: null,
  sector: null,
  vertical: null,
  providerCategory: null,
  fundingStatus: null,
  minimumAge: null,
  maximumAge: null,
  provisionPattern: null,
  childcare: null,
  charitable: null,
  food: null,
  transport: null,
  trips: null,
  boarding: null,
  ace: null,
  icce: null,
};
export function ProfileFields({
  value,
  setValue,
  jurisdictions,
}: {
  value: TrackerProfileInput;
  setValue: (value: TrackerProfileInput) => void;
  jurisdictions: TrackerJurisdiction[];
}) {
  function set<K extends keyof TrackerProfileInput>(
    key: K,
    next: TrackerProfileInput[K],
  ) {
    setValue({ ...value, [key]: next });
  }
  const activities = [
    "childcare",
    "charitable",
    "food",
    "transport",
    "trips",
    "boarding",
    "ace",
    "icce",
  ] as const;
  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
      <label className="block min-w-0 sm:col-span-2">
        Operating country / nation / jurisdiction
        <select
          className={fieldClass}
          value={value.jurisdictionId ?? ""}
          onChange={(e) => set("jurisdictionId", e.target.value || null)}
        >
          <option value="">Unknown — choose operating location</option>
          {jurisdictions.map((j) => (
            <option key={j.id} value={j.id}>
              {j.countryCode} · {j.name} ({j.level.toLowerCase()})
            </option>
          ))}
        </select>
        <span className="text-sm text-text-muted">
          Choose the most specific location available. UK sites require a
          nation. Billing address is not used.
        </span>
      </label>
      {(["region", "localAuthority"] as const).map((key) => (
        <label className="block min-w-0" key={key}>
          {key === "region" ? "Region" : "Local authority"}
          <input
            className={fieldClass}
            maxLength={200}
            value={value[key] ?? ""}
            onChange={(e) => set(key, e.target.value || null)}
          />
        </label>
      ))}
      <Choice
        label="Sector"
        value={value.sector}
        options={SECTOR_OPTIONS.map((o) => o.value)}
        onChange={(sector) => setValue({ ...value, sector, vertical: null })}
      />
      <Choice
        label="Product type"
        value={value.vertical}
        options={INSTITUTIONAL_VERTICALS.filter(
          (v) => !value.sector || institutionalSector(v) === value.sector,
        )}
        onChange={(vertical) =>
          setValue({
            ...value,
            vertical,
            sector: vertical ? institutionalSector(vertical) : value.sector,
          })
        }
      />
      <Choice
        label="Actual provider category"
        value={value.providerCategory}
        options={[
          "INDEPENDENT_SCHOOL",
          "STATE_SCHOOL",
          "EARLY_YEARS",
          "CHILDCARE",
          "OUT_OF_SCHOOL",
          "OTHER",
        ]}
        onChange={(v) => set("providerCategory", v)}
      />
      <Choice
        label="Funding status"
        value={value.fundingStatus}
        options={["PUBLIC", "PRIVATE", "MIXED"]}
        onChange={(v) => set("fundingStatus", v)}
      />
      <p className="text-sm text-text-muted sm:col-span-2">
        ACE participation and legal school status are separate. Public Learning
        Centre means non-ACE; it does not mean publicly funded.
      </p>
      {(["minimumAge", "maximumAge"] as const).map((key) => (
        <label className="block min-w-0" key={key}>
          {key === "minimumAge" ? "Minimum age (years)" : "Maximum age (years)"}
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            className={fieldClass}
            value={value[key] ?? ""}
            onChange={(e) =>
              set(key, e.target.value === "" ? null : Number(e.target.value))
            }
          />
        </label>
      ))}
      <Choice
        label="Provision pattern"
        value={value.provisionPattern}
        options={["FULL_TIME", "PART_TIME", "MIXED"]}
        onChange={(v) => set("provisionPattern", v)}
      />
      <ProfileFacts
        value={value}
        setValue={setValue}
        jurisdictions={jurisdictions}
      />
      {activities.map((key) => (
        <label key={key} className="block min-w-0">
          {key === "ace"
            ? "ACE participation"
            : key === "icce"
              ? "Offers ICCE qualifications"
              : words(key)}
          <select
            className={fieldClass}
            value={value[key] === null ? "unknown" : String(value[key])}
            onChange={(e) =>
              set(
                key,
                e.target.value === "unknown" ? null : e.target.value === "true",
              )
            }
          >
            <option value="unknown">Unknown</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </label>
      ))}
    </div>
  );
}
