import { TRACKER_TOPICS, type TrackerProfileInput } from "@pathway/types";
import { TRACKER_CATALOGUE, catalogueSchema } from "..";
import { catalogueV124 } from "../v1.24";
import { trackerProfileInput } from "../../tracker.dto";
import { buildTrackerChecklist } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";
import { netherlandsMunicipalityCodes } from "./locations";

function checklist(
  changes: Partial<TrackerProfileInput>,
  subdivisionCode = "NL-GM0363",
) {
  const now = new Date(`${TRACKER_CATALOGUE.releasedAt}T12:00:00Z`);
  return buildTrackerChecklist({
    catalogue: TRACKER_CATALOGUE,
    profile: {
      version: 1,
      updatedAt: now.toISOString(),
      profile: trackerProfileInput.parse({ ...testProfile, ...changes }),
    },
    location: { countryCode: "NL", subdivisionCode },
    attestations: [],
    evidenceCounts: {},
    now,
  });
}

function applicability(
  id: string,
  changes: Partial<TrackerProfileInput>,
  subdivisionCode?: string,
) {
  return checklist(changes, subdivisionCode).items.find(
    (item) => item.requirement.id === id,
  )?.applicability;
}

describe("Netherlands progressive national release", () => {
  it("separates non-funded B3, funded denominational schools and non-ACE tuition", () => {
    const b3 = {
      sector: "SCHOOL" as const,
      providerCategory: "INDEPENDENT_SCHOOL" as const,
      fundingStatus: "PRIVATE" as const,
      icce: true,
    };
    expect(applicability("nl.b3-notification", b3)).toBe("APPLICABLE");
    expect(applicability("nl.icce-provider", b3)).toBe("APPLICABLE");
    const fundedFaithSchool = {
      sector: "CHURCH" as const,
      vertical: "CHURCH" as const,
      providerCategory: "STATE_SCHOOL" as const,
      fundingStatus: "PUBLIC" as const,
      icce: false,
    };
    expect(applicability("nl.b3-notification", fundedFaithSchool)).toBe(
      "NOT_APPLICABLE",
    );
    expect(applicability("nl.funded-school-authority", fundedFaithSchool)).toBe(
      "APPLICABLE",
    );
    const centre = {
      sector: "LEARNING_CENTRE" as const,
      vertical: "PUBLIC_LEARNING_CENTRE" as const,
      providerCategory: "OUT_OF_SCHOOL" as const,
      fundingStatus: "PRIVATE" as const,
      icce: false,
    };
    expect(applicability("nl.b3-notification", centre)).toBe("NOT_APPLICABLE");
    expect(applicability("nl.funded-school-authority", centre)).toBe(
      "NOT_APPLICABLE",
    );
    expect(applicability("nl.tuition-route", centre)).toBe("APPLICABLE");
  });

  it("keeps LRK, PRK and municipality actions conditional", () => {
    expect(applicability("nl.childcare-lrk", { childcare: true })).toBe(
      "APPLICABLE",
    );
    expect(applicability("nl.childcare-prk", { childcare: true })).toBe(
      "APPLICABLE",
    );
    expect(
      applicability("nl.childcare-prk", {
        childcare: false,
        providerCategory: "OUT_OF_SCHOOL",
      }),
    ).toBe("NOT_APPLICABLE");
    expect(applicability("nl.municipal-interface", {}, "")).toBe("UNRESOLVED");
    expect(applicability("nl.municipal-interface", {})).toBe("APPLICABLE");
  });

  it("publishes eight partial topics and preserves the previous release", () => {
    expect(catalogueSchema.safeParse(TRACKER_CATALOGUE).success).toBe(true);
    expect(netherlandsMunicipalityCodes).toHaveLength(342);
    expect(new Set(netherlandsMunicipalityCodes).size).toBe(342);
    const cells = TRACKER_CATALOGUE.coverage.filter(
      (cell) => cell.jurisdiction === "NL",
    );
    expect(cells).toHaveLength(48);
    expect(
      cells.every(
        (cell) =>
          cell.status === "PARTIALLY_PUBLISHED" &&
          cell.regionalStatus === "IN_REVIEW" &&
          cell.requiresRegion,
      ),
    ).toBe(true);
    expect(new Set(cells.map((cell) => cell.sector)).size).toBe(6);
    for (const topic of TRACKER_TOPICS) {
      expect(
        TRACKER_CATALOGUE.requirements.some(
          (requirement) =>
            requirement.jurisdiction === "NL" && requirement.topic === topic,
        ),
      ).toBe(true);
    }
    expect(TRACKER_CATALOGUE.version).toBe("1.29.0");
    expect(TRACKER_CATALOGUE.sources).toEqual(
      expect.arrayContaining(catalogueV124.sources),
    );
    expect(TRACKER_CATALOGUE.requirements).toEqual(
      expect.arrayContaining(catalogueV124.requirements),
    );
  });
});
