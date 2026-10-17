import { catalogueSchema } from "../schema";
import { evaluateCondition } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";
import {
  recordsRouteRequirements,
  recordsRouteSources,
} from "./records-routes";

const location = { countryCode: "GB", subdivisionCode: "GB-ENG" };
describe("England record-route assessment", () => {
  it("validates published requirement and reviewed source references", () => {
    expect(
      catalogueSchema.safeParse({
        schemaVersion: 1,
        version: "records-test",
        releasedAt: "2026-10-15",
        sources: recordsRouteSources,
        requirements: recordsRouteRequirements,
        coverage: [],
      }).success,
    ).toBe(true);
  });
  it.each([true, false, null])(
    "does not suppress record routing for controller status %s",
    (personalDataController) => {
      for (const sector of [
        "SCHOOL",
        "CHURCH",
        "CHARITY",
        "CLUB",
        "LEARNING_CENTRE",
        null,
      ] as const) {
        for (const requirement of recordsRouteRequirements) {
          expect(requirement.condition).toBeNull();
          expect(requirement.obligationClass).toBe("RECOMMENDATION");
          expect(
            evaluateCondition(
              requirement.condition,
              { ...testProfile, sector, personalDataController },
              location,
            ),
          ).toBe("APPLICABLE");
          expect(requirement.allowsNotApplicable).toBe(false);
          expect(requirement.signalKeys).toEqual([]);
        }
      }
    },
  );
  it("retains nursery coverage without inferring the parental-access legal route", () => {
    expect(recordsRouteRequirements[0].sectors).toContain("NURSERY");
    expect(
      evaluateCondition(
        recordsRouteRequirements[0].condition,
        {
          ...testProfile,
          sector: "SCHOOL",
          vertical: "NURSERY",
          personalDataController: false,
        },
        location,
      ),
    ).toBe("APPLICABLE");
  });
  it("records the verified register commencement and distinguishes amendment uncertainty", () => {
    expect(
      recordsRouteSources.find((s) => s.id === "eng-records-register-retention")
        ?.effective.from,
    ).toBe("2024-08-19");
    expect(
      recordsRouteSources.find((s) => s.id === "eng-records-parental-access")
        ?.effective,
    ).toMatchObject({ from: null, currentAsOf: "2026-10-15" });
  });
});
