import type { TrackerProfileInput } from "@pathway/types";
import { catalogueSchema } from "../schema";
import { evaluateCondition } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";
import { premisesRequirements } from "./premises";
import { activitiesRequirements } from "./activities";
import { operationsSources } from "./operations-sources";

const requirements = [...premisesRequirements, ...activitiesRequirements];
const location = { countryCode: "GB", subdivisionCode: "GB-WLS" };
function item(id: string) {
  const requirement = requirements.find((entry) => entry.id === `wls-${id}`);
  if (!requirement) throw new Error(`Missing Welsh operation: ${id}`);
  return requirement;
}
function applicability(id: string, changes: Partial<TrackerProfileInput>) {
  return evaluateCondition(
    item(id).condition,
    { ...testProfile, ...changes },
    location,
  );
}

describe("Wales bounded operational duties and assessments", () => {
  it("validates precise reviewed sources for all six research sectors", () => {
    expect(
      catalogueSchema.safeParse({
        schemaVersion: 1,
        version: "wales-operations-test",
        releasedAt: "2026-10-17",
        sources: operationsSources,
        requirements,
        coverage: [],
      }).success,
    ).toBe(true);
    for (const requirement of requirements) {
      expect(new Set(requirement.sectors)).toEqual(
        new Set([
          "SCHOOL",
          "NURSERY",
          "CHURCH",
          "CHARITY",
          "CLUB",
          "LEARNING_CENTRE",
        ]),
      );
      expect(requirement.jurisdiction).toBe("GB-WLS");
    }
    for (const source of operationsSources) {
      expect(source.review.verifiedAt).toBe("2026-10-17");
      expect(source.review.reviewDueAt).toBe("2027-01-12");
      if (!source.effective.from)
        expect(source.effective.currentAsOf).toBe("2026-10-17");
      expect(source.authority).not.toMatch(/Department for Education/);
    }
  });

  it.each(["employer-risk", "employer-firstaid"])(
    "uses actual employment and preserves uncertainty for %s",
    (id) => {
      expect(item(id).obligationClass).toBe("STATUTORY_DUTY");
      expect(applicability(id, { employsStaff: true, sector: "CHURCH" })).toBe(
        "APPLICABLE",
      );
      expect(applicability(id, { employsStaff: false, sector: "SCHOOL" })).toBe(
        "NOT_APPLICABLE",
      );
      expect(applicability(id, { employsStaff: null })).toBe("UNRESOLVED");
    },
  );

  it.each(["food-registration", "food-safety"])(
    "requires confirmed food-business classification for %s",
    (id) => {
      expect(applicability(id, { food: true, foodBusiness: null })).toBe(
        "UNRESOLVED",
      );
      expect(applicability(id, { food: true, foodBusiness: false })).toBe(
        "NOT_APPLICABLE",
      );
      expect(applicability(id, { foodBusiness: true })).toBe("APPLICABLE");
      expect(item(id).obligationClass).toBe("STATUTORY_DUTY");
    },
  );

  it("assesses statutory rating scope rather than inferring every food business is rated", () => {
    expect(item("food-rating-review").obligationClass).toBe("RECOMMENDATION");
    expect(applicability("food-rating-review", { foodBusiness: true })).toBe(
      "APPLICABLE",
    );
    expect(applicability("food-rating-review", { foodBusiness: null })).toBe(
      "UNRESOLVED",
    );
    const source = operationsSources.find(
      (entry) => entry.id === "wls-op-foodrating",
    );
    expect(source?.url).toContain("/anaw/2013/2/section/7/");
    expect(source?.provision).toMatch(/Section 7/);
  });

  it("classifies school accessibility from actual Welsh provision, not branding or England flags", () => {
    expect(
      applicability("school-accessibility", {
        sector: "CHURCH",
        providerCategory: "INDEPENDENT_SCHOOL",
      }),
    ).toBe("APPLICABLE");
    expect(
      applicability("school-accessibility", {
        sector: "SCHOOL",
        providerCategory: "OUT_OF_SCHOOL",
        schoolCategory: "INDEPENDENT",
        englandSchoolMedicalDutiesApply: true,
        eyfsApplies: true,
      }),
    ).toBe("NOT_APPLICABLE");
    expect(
      applicability("school-accessibility", { providerCategory: null }),
    ).toBe("UNRESOLVED");
    expect(
      JSON.stringify(requirements.map((entry) => entry.condition)),
    ).not.toMatch(/englandSchoolMedicalDutiesApply|eyfsApplies|schoolCategory/);
  });

  it.each([
    "safety-responsibilities",
    "accessibility-review",
    "healthcare-review",
    "adventure-review",
  ])(
    "retains %s assessment for volunteer-only community and non-school nursery provision",
    (id) => {
      for (const sector of [
        "SCHOOL",
        "LEARNING_CENTRE",
        "CHURCH",
        "CHARITY",
        "CLUB",
      ] as const) {
        expect(
          applicability(id, {
            sector,
            providerCategory: "OUT_OF_SCHOOL",
            employsStaff: false,
            controlsPremises: false,
            trips: false,
          }),
        ).toBe("APPLICABLE");
      }
      expect(applicability(id, { providerCategory: "EARLY_YEARS" })).toBe(
        "APPLICABLE",
      );
      expect(item(id).obligationClass).toBe("RECOMMENDATION");
      expect(item(id).allowsNotApplicable).toBe(false);
    },
  );

  it("preserves shared-premises role uncertainty without treating premises control as a fire certificate", () => {
    expect(
      applicability("fire-review", {
        controlsPremises: null,
        employsStaff: false,
      }),
    ).toBe("UNRESOLVED");
    expect(
      applicability("fire-review", {
        controlsPremises: true,
        employsStaff: false,
      }),
    ).toBe("APPLICABLE");
    expect(item("fire-review").obligationClass).toBe("RECOMMENDATION");
  });

  it("covers contracted transport without inferring vehicle operation or permit eligibility", () => {
    expect(
      applicability("transport-review", {
        transport: true,
        operatesVehicles: false,
      }),
    ).toBe("APPLICABLE");
    expect(
      applicability("transport-review", {
        transport: false,
        operatesVehicles: true,
      }),
    ).toBe("APPLICABLE");
    expect(
      applicability("transport-review", {
        transport: null,
        operatesVehicles: false,
      }),
    ).toBe("UNRESOLVED");
    expect(item("transport-review").obligationClass).toBe("RECOMMENDATION");
  });

  it("separates residential classification from the boarding flag and Wales from English standards", () => {
    expect(applicability("boarding-review", { boarding: true })).toBe(
      "APPLICABLE",
    );
    expect(applicability("boarding-review", { boarding: false })).toBe(
      "NOT_APPLICABLE",
    );
    expect(applicability("boarding-review", { boarding: null })).toBe(
      "UNRESOLVED",
    );
    expect(item("boarding-review").obligationClass).toBe("RECOMMENDATION");
    const sources = operationsSources.filter((source) =>
      item("boarding-review").sourceIds.includes(source.id),
    );
    expect(
      sources.some((source) =>
        source.provision.includes("Special-school-residential"),
      ),
    ).toBe(true);
    expect(
      sources.some((source) =>
        source.authority.includes("Care Inspectorate Wales"),
      ),
    ).toBe(true);
  });
});
