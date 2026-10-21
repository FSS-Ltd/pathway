"use client";
import React from "react";
import {
  INSTITUTIONAL_VERTICALS,
  institutionalSector,
  SECTOR_OPTIONS,
} from "@pathway/types";
import type {
  TrackerProfileInput,
  TrackerJurisdiction,
  TrackerChecklist,
} from "@pathway/types";
import { Choice, words } from "./profile-choice";
export { words } from "./profile-choice";
import { ProfileFacts } from "./profile-facts";
import { BelgianSchoolRouteFields } from "./belgian-school-route-fields";
import { fieldClass } from "../agreements/shared";
export const emptyProfile: TrackerProfileInput = {
  jurisdictionId: null,
  region: null,
  localAuthority: null,
  belgianEducationCommunity: null,
  belgianSchoolRecognitionStatus: null,
  belgianFrenchSchoolRoute: null,
  belgianChildcareAuthority: null,
  belgianPaidUnderThreeCare: null,
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

function jurisdictionLabel(jurisdiction: TrackerJurisdiction): string {
  let level = jurisdiction.level.toLowerCase();
  if (jurisdiction.subdivisionCode?.startsWith("GB-ENG-E")) {
    level =
      jurisdiction.level === "REGION"
        ? "upper-tier council"
        : "district council";
  } else if (jurisdiction.subdivisionCode?.startsWith("GB-SCT-S12")) {
    level = "council area";
  } else if (jurisdiction.subdivisionCode?.startsWith("GB-NIR-N09")) {
    level = "local government district";
  } else if (jurisdiction.subdivisionCode?.startsWith("IE-LA-")) {
    level = "local authority";
  } else if (/^AT-[1-9]$/.test(jurisdiction.subdivisionCode ?? "")) {
    level = "Bundesland";
  } else if (/^BE[1-3]$/.test(jurisdiction.subdivisionCode ?? "")) {
    level = "Region";
  }
  return `${jurisdiction.name} · ${jurisdiction.countryCode} (${level})`;
}

export function ProfileFields({
  value,
  setValue,
  jurisdictions,
  organisationFacts,
}: {
  value: TrackerProfileInput;
  setValue: (value: TrackerProfileInput) => void;
  jurisdictions: TrackerJurisdiction[];
  organisationFacts?: TrackerChecklist["organisationFacts"];
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
  const isBelgianSite = jurisdictions.some(
    (jurisdiction) =>
      jurisdiction.id === value.jurisdictionId &&
      jurisdiction.countryCode === "BE",
  );
  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
      <label className="block min-w-0 sm:col-span-2">
        Operating country / nation / jurisdiction
        <select
          className={fieldClass}
          value={value.jurisdictionId ?? ""}
          onChange={(e) => {
            const jurisdictionId = e.target.value || null;
            const country = jurisdictions.find(
              (item) => item.id === jurisdictionId,
            )?.countryCode;
            setValue({
              ...value,
              jurisdictionId,
              belgianEducationCommunity:
                country === "BE" && jurisdictionId === value.jurisdictionId
                  ? value.belgianEducationCommunity
                  : null,
              belgianSchoolRecognitionStatus:
                country === "BE" && jurisdictionId === value.jurisdictionId
                  ? value.belgianSchoolRecognitionStatus
                  : null,
              belgianFrenchSchoolRoute:
                country === "BE" && jurisdictionId === value.jurisdictionId
                  ? value.belgianFrenchSchoolRoute
                  : null,
              belgianChildcareAuthority:
                country === "BE" && jurisdictionId === value.jurisdictionId
                  ? value.belgianChildcareAuthority
                  : null,
              belgianPaidUnderThreeCare:
                country === "BE" ? value.belgianPaidUnderThreeCare : null,
            });
          }}
        >
          <option value="">Unknown — choose operating location</option>
          {jurisdictions.map((j) => (
            <option key={j.id} value={j.id}>
              {jurisdictionLabel(j)}
            </option>
          ))}
        </select>
        <span className="text-sm text-text-muted">
          Choose the most specific location available. UK sites require a
          nation. Billing address is not used.
        </span>
      </label>
      {isBelgianSite && (
        <div className="space-y-2 sm:col-span-2">
          <Choice
            label="Education language Community"
            value={value.belgianEducationCommunity ?? null}
            options={["FLEMISH", "FRENCH", "GERMAN_SPEAKING"]}
            onChange={(belgianEducationCommunity) =>
              setValue({
                ...value,
                belgianEducationCommunity,
                belgianSchoolRecognitionStatus: null,
                belgianFrenchSchoolRoute: null,
              })
            }
          />
          <p className="text-sm text-text-muted">
            Belgium's geographic Region does not identify the education
            Community. Confirm the competent authority for the site's actual
            education. This selection does not certify registration or remove
            unreviewed coverage gaps.
          </p>
          <BelgianSchoolRouteFields value={value} setValue={setValue} />
          <Choice
            label="Childcare licensing authority"
            value={value.belgianChildcareAuthority ?? null}
            options={[
              "OPGROEIEN",
              "ONE",
              "IRISCARE",
              "GERMAN_COMMUNITY_MINISTRY",
            ]}
            onChange={(belgianChildcareAuthority) =>
              set("belgianChildcareAuthority", belgianChildcareAuthority)
            }
          />
          <label className="block min-w-0">
            Paid professional care for children under three
            <select
              className={fieldClass}
              value={
                value.belgianPaidUnderThreeCare === null ||
                value.belgianPaidUnderThreeCare === undefined
                  ? "unknown"
                  : String(value.belgianPaidUnderThreeCare)
              }
              onChange={(event) =>
                set(
                  "belgianPaidUnderThreeCare",
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
          <p className="text-sm text-text-muted">
            Confirm the care service's own authority; the education Community
            may differ. In Brussels, organised language and service type affect
            the route. Check with the local authority before treating any care
            action as not applicable.
          </p>
        </div>
      )}
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
      {organisationFacts?.sector ? (
        <p className="text-sm">
          <strong>Sector:</strong> {words(organisationFacts.sector)} · from
          organisation settings
        </p>
      ) : (
        <Choice
          label="Sector"
          value={value.sector}
          options={SECTOR_OPTIONS.map((o) => o.value)}
          onChange={(sector) => setValue({ ...value, sector, vertical: null })}
        />
      )}
      {organisationFacts?.vertical ? (
        <p className="text-sm">
          <strong>Product type:</strong> {words(organisationFacts.vertical)} ·
          from organisation settings
        </p>
      ) : (
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
      )}
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
        onChange={(providerCategory) =>
          setValue({
            ...value,
            providerCategory,
            belgianSchoolRecognitionStatus:
              !providerCategory ||
              ["INDEPENDENT_SCHOOL", "STATE_SCHOOL"].includes(providerCategory)
                ? value.belgianSchoolRecognitionStatus
                : null,
            belgianFrenchSchoolRoute:
              !providerCategory ||
              ["INDEPENDENT_SCHOOL", "STATE_SCHOOL"].includes(providerCategory)
                ? value.belgianFrenchSchoolRoute
                : null,
          })
        }
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
      {activities
        .filter((key) => key !== "ace" || organisationFacts?.ace !== true)
        .map((key) => (
          <label key={key} className="block min-w-0">
            {key === "ace"
              ? "ACE participation"
              : key === "icce"
                ? "Offers ICCE qualifications"
                : words(key)}
            <select
              className={fieldClass}
              value={value[key] === null ? "unknown" : String(value[key])}
              onChange={(e) => {
                const next =
                  e.target.value === "unknown"
                    ? null
                    : e.target.value === "true";
                if (key === "childcare" && next === false)
                  setValue({
                    ...value,
                    childcare: false,
                    belgianChildcareAuthority: null,
                    belgianPaidUnderThreeCare: null,
                  });
                else set(key, next);
              }}
            >
              <option value="unknown">Unknown</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>
        ))}
      {organisationFacts?.ace === true && (
        <p className="text-sm sm:col-span-2">
          <strong>ACE participation:</strong> Yes · from the organisation
          product type
        </p>
      )}
    </div>
  );
}
