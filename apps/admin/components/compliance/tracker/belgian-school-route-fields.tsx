import React from "react";
import type { TrackerProfileInput } from "@pathway/types";
import { fieldClass } from "../agreements/shared";

type Props = {
  value: TrackerProfileInput;
  setValue: (value: TrackerProfileInput) => void;
};

export function BelgianSchoolRouteFields({ value, setValue }: Props) {
  if (
    value.providerCategory &&
    !["INDEPENDENT_SCHOOL", "STATE_SCHOOL"].includes(value.providerCategory)
  )
    return null;

  if (value.belgianEducationCommunity === "FLEMISH")
    return (
      <>
        <label className="block min-w-0">
          School recognition with this education Community
          <select
            className={fieldClass}
            value={value.belgianSchoolRecognitionStatus ?? ""}
            disabled={!value.providerCategory}
            onChange={(event) =>
              setValue({
                ...value,
                belgianSchoolRecognitionStatus:
                  event.target.value === "COMMUNITY_RECOGNISED" ||
                  event.target.value === "NOT_RECOGNISED" ||
                  event.target.value === "RECOGNISED_ELSEWHERE"
                    ? event.target.value
                    : null,
              })
            }
          >
            <option value="">
              {value.providerCategory
                ? "Unknown"
                : "Choose actual provider category first"}
            </option>
            <option value="COMMUNITY_RECOGNISED">
              Recognised by this Community
            </option>
            <option value="NOT_RECOGNISED">Not recognised</option>
            <option value="RECOGNISED_ELSEWHERE">
              Recognised by another authority
            </option>
          </select>
        </label>
        <p className="text-sm text-text-muted">
          Recognition and public funding are separate. Confirm the school's
          status with its education authority; a private school may be
          unrecognised or recognised elsewhere.
        </p>
      </>
    );

  if (value.belgianEducationCommunity === "FRENCH")
    return (
      <>
        <label className="block min-w-0">
          French Community school route
          <select
            className={fieldClass}
            value={value.belgianFrenchSchoolRoute ?? ""}
            disabled={!value.providerCategory}
            onChange={(event) =>
              setValue({
                ...value,
                belgianFrenchSchoolRoute:
                  event.target.value === "FWB_ORGANISED" ||
                  event.target.value === "FWB_SUBSIDISED" ||
                  event.target.value === "OUTSIDE_FWB_NETWORK"
                    ? event.target.value
                    : null,
              })
            }
          >
            <option value="">
              {value.providerCategory
                ? "Unknown"
                : "Choose actual provider category first"}
            </option>
            <option value="FWB_ORGANISED">Organised by WBE</option>
            <option value="FWB_SUBSIDISED">
              Subsidised by the French Community
            </option>
            <option value="OUTSIDE_FWB_NETWORK">
              Neither organised nor subsidised
            </option>
          </select>
        </label>
        <p className="text-sm text-text-muted">
          Confirm the school's actual route with the French Community. A private
          school outside its organised or subsidised network follows different
          compulsory-education rules for families.
        </p>
      </>
    );

  if (value.belgianEducationCommunity === "GERMAN_SPEAKING")
    return (
      <>
        <label className="block min-w-0">
          German-speaking Community school route
          <select
            className={fieldClass}
            value={value.belgianGermanSchoolRoute ?? ""}
            disabled={!value.providerCategory}
            onChange={(event) =>
              setValue({
                ...value,
                belgianGermanSchoolRoute:
                  event.target.value === "DG_ORGANISED" ||
                  event.target.value === "DG_SUBSIDISED" ||
                  event.target.value === "DG_RECOGNISED_UNSUBSIDISED" ||
                  event.target.value === "OUTSIDE_DG_NETWORK"
                    ? event.target.value
                    : null,
              })
            }
          >
            <option value="">
              {value.providerCategory
                ? "Unknown"
                : "Choose actual provider category first"}
            </option>
            <option value="DG_ORGANISED">Organised by the Community</option>
            <option value="DG_SUBSIDISED">Subsidised by the Community</option>
            <option value="DG_RECOGNISED_UNSUBSIDISED">
              Recognised, no subsidy
            </option>
            <option value="OUTSIDE_DG_NETWORK">
              Neither organised, subsidised nor recognised
            </option>
          </select>
        </label>
        <p className="text-sm text-text-muted">
          Recognition and subsidy are separate. Confirm the school's actual
          route with the German-speaking Community; the organised and subsidised
          school rules do not automatically apply to other providers.
        </p>
        <label className="block min-w-0">
          Reduced-hours secondary education under the Community decree
          <select
            className={fieldClass}
            value={
              value.belgianGermanReducedHoursSecondary == null
                ? "unknown"
                : String(value.belgianGermanReducedHoursSecondary)
            }
            disabled={!value.providerCategory}
            onChange={(event) =>
              setValue({
                ...value,
                belgianGermanReducedHoursSecondary:
                  event.target.value === "unknown"
                    ? null
                    : event.target.value === "true",
              })
            }
          >
            <option value="unknown">Unknown</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        </label>
        <p className="text-sm text-text-muted">
          This is the decree's specific reduced-hours secondary category, not
          simply a part-time timetable. Confirm the classification with the
          Community before marking it no.
        </p>
      </>
    );

  return null;
}
