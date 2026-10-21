import { TRACKER_TOPICS, type TrackerProfileInput } from "@pathway/types";
import { TRACKER_CATALOGUE, catalogueSchema } from "..";
import { catalogueV123 } from "../v1.23";
import { trackerProfileInput } from "../../tracker.dto";
import { buildTrackerChecklist } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";
import { maltaCouncilCodes } from "./locations";

function checklist(
  changes: Partial<TrackerProfileInput>,
  subdivisionCode = "MT-LC-IL-BELT-VALLETTA",
) {
  const now = new Date(`${TRACKER_CATALOGUE.releasedAt}T12:00:00Z`);
  return buildTrackerChecklist({
    catalogue: TRACKER_CATALOGUE,
    profile: {
      version: 1,
      updatedAt: now.toISOString(),
      profile: trackerProfileInput.parse({ ...testProfile, ...changes }),
    },
    location: { countryCode: "MT", subdivisionCode },
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

describe("Malta progressive national release", () => {
  it("separates actual private-school licensing and ICCE from non-ACE out-of-school provision", () => {
    const school = {
      sector: "SCHOOL" as const,
      providerCategory: "INDEPENDENT_SCHOOL" as const,
      icce: true,
    };
    expect(applicability("mt.private-school-licence", school)).toBe(
      "APPLICABLE",
    );
    expect(applicability("mt.icce-registration", school)).toBe("APPLICABLE");
    const centre = {
      sector: "LEARNING_CENTRE" as const,
      vertical: "PUBLIC_LEARNING_CENTRE" as const,
      providerCategory: "OUT_OF_SCHOOL" as const,
      fundingStatus: "PRIVATE" as const,
      icce: false,
    };
    expect(applicability("mt.private-school-licence", centre)).toBe(
      "NOT_APPLICABLE",
    );
    expect(applicability("mt.public-school-authority", centre)).toBe(
      "NOT_APPLICABLE",
    );
    expect(applicability("mt.out-of-school-route", centre)).toBe("APPLICABLE");
    expect(applicability("mt.icce-registration", centre)).toBe(
      "NOT_APPLICABLE",
    );
  });

  it("keeps 0–3 care, POMA roles and local councils conditional", () => {
    expect(applicability("mt.ecec-licence", { childcare: true })).toBe(
      "APPLICABLE",
    );
    expect(
      applicability("mt.ecec-personnel-clearance", { childcare: true }),
    ).toBe("APPLICABLE");
    expect(
      applicability("mt.ecec-licence", {
        childcare: false,
        providerCategory: "OUT_OF_SCHOOL",
      }),
    ).toBe("NOT_APPLICABLE");
    expect(
      applicability("mt.ecec-personnel-clearance", {
        childcare: false,
        providerCategory: "OUT_OF_SCHOOL",
      }),
    ).toBe("NOT_APPLICABLE");
    expect(
      applicability("mt.child-contact-checks", {
        minimumAge: 18,
        maximumAge: 30,
      }),
    ).toBe("NOT_APPLICABLE");
    expect(applicability("mt.local-education-interface", {}, "")).toBe(
      "UNRESOLVED",
    );
  });

  it("publishes eight partial topics and preserves the previous release", () => {
    expect(catalogueSchema.safeParse(TRACKER_CATALOGUE).success).toBe(true);
    expect(maltaCouncilCodes).toHaveLength(68);
    expect(new Set(maltaCouncilCodes).size).toBe(68);
    const cells = TRACKER_CATALOGUE.coverage.filter(
      (cell) => cell.jurisdiction === "MT",
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
            requirement.jurisdiction === "MT" && requirement.topic === topic,
        ),
      ).toBe(true);
    }
    expect(TRACKER_CATALOGUE.sources).toEqual(
      expect.arrayContaining(catalogueV123.sources),
    );
    expect(TRACKER_CATALOGUE.requirements).toEqual(
      expect.arrayContaining(catalogueV123.requirements),
    );
  });
});
