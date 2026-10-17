import { catalogueSchema } from "../schema";
import { evaluateCondition } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";
import { commonOperationsRequirements } from "./common-operations";
import { commonOperationsSources } from "./common-operations-sources";

const location = { countryCode: "GB", subdivisionCode: "GB-ENG" };
describe("England common operational assessments", () => {
  it("validates source references and covers the nursery research sector", () => {
    expect(
      catalogueSchema.safeParse({
        schemaVersion: 1,
        version: "common-operations-test",
        releasedAt: "2026-10-15",
        sources: commonOperationsSources,
        requirements: commonOperationsRequirements,
        coverage: [],
      }).success,
    ).toBe(true);
    expect(commonOperationsRequirements).toHaveLength(2);
    for (const requirement of commonOperationsRequirements)
      expect(requirement.sectors).toContain("NURSERY");
  });
  it.each(["SCHOOL", "LEARNING_CENTRE", "CHURCH", "CHARITY", "CLUB"] as const)(
    "retains assessments for %s without employees or premises control",
    (sector) => {
      for (const requirement of commonOperationsRequirements) {
        expect(
          evaluateCondition(
            requirement.condition,
            {
              ...testProfile,
              sector,
              employsStaff: false,
              controlsPremises: false,
            },
            location,
          ),
        ).toBe("APPLICABLE");
        expect(requirement.obligationClass).toBe("RECOMMENDATION");
        expect(requirement.allowsNotApplicable).toBe(false);
      }
    },
  );
  it("retains assessments when responsibility is unknown", () => {
    for (const requirement of commonOperationsRequirements)
      expect(
        evaluateCondition(
          requirement.condition,
          { ...testProfile, employsStaff: null, controlsPremises: null },
          location,
        ),
      ).toBe("APPLICABLE");
  });
});
