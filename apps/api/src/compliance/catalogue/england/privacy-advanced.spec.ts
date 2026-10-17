import { catalogueSchema } from "../schema";
import { evaluateCondition } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";
import { privacySources, privacyRequirements } from "./privacy";
import { privacyAdvancedSources } from "./privacy-advanced-sources";
import { privacyAdvancedRequirements } from "./privacy-advanced";

const location = { countryCode: "GB", subdivisionCode: "GB-ENG" };
describe("England conditional privacy assessments", () => {
  it("validates reviewed sources and avoids duplicate existing privacy actions", () => {
    const result = catalogueSchema.safeParse({
      schemaVersion: 1,
      version: "privacy-test",
      releasedAt: "2026-10-15",
      sources: [...privacySources, ...privacyAdvancedSources],
      requirements: [...privacyRequirements, ...privacyAdvancedRequirements],
      coverage: [],
    });
    expect(result.success).toBe(true);
    expect(
      new Set(
        [...privacyRequirements, ...privacyAdvancedRequirements].map(
          (r) => r.id,
        ),
      ).size,
    ).toBe(privacyRequirements.length + privacyAdvancedRequirements.length);
  });
  it.each([
    "SCHOOL",
    "NURSERY",
    "CHURCH",
    "CHARITY",
    "CLUB",
    "LEARNING_CENTRE",
  ] as const)(
    "offers bounded assessments in %s without inferring conditional activities",
    (sector) => {
      for (const requirement of privacyAdvancedRequirements) {
        expect(requirement.sectors).toContain(sector);
        expect(requirement.obligationClass).toBe("RECOMMENDATION");
        expect(
          evaluateCondition(
            requirement.condition,
            {
              ...testProfile,
              sector: sector === "NURSERY" ? "SCHOOL" : sector,
              personalDataController: true,
            },
            location,
          ),
        ).toBe("APPLICABLE");
        expect(
          evaluateCondition(
            requirement.condition,
            {
              ...testProfile,
              sector: sector === "NURSERY" ? "SCHOOL" : sector,
              personalDataController: null,
            },
            location,
          ),
        ).toBe(requirement.condition === null ? "APPLICABLE" : "UNRESOLVED");
        expect(
          evaluateCondition(
            requirement.condition,
            {
              ...testProfile,
              sector: sector === "NURSERY" ? "SCHOOL" : sector,
              personalDataController: false,
            },
            location,
          ),
        ).toBe(
          requirement.condition === null ? "APPLICABLE" : "NOT_APPLICABLE",
        );
        expect(requirement.signalKeys).toEqual([]);
        if (
          [
            "eng-privacy-transfer-review",
            "eng-privacy-electronic-marketing-review",
            "eng-privacy-storage-access-review",
          ].includes(requirement.id)
        )
          expect(requirement.condition).toBeNull();
      }
    },
  );
  it("records exact amended-law dates without applying them to unchanged provisions", () => {
    const source = (id: string) =>
      privacyAdvancedSources.find(
        (entry) => entry.id === `eng-privacy-advanced-${id}`,
      );
    for (const id of [
      "transfers",
      "storage-access",
      "storage-exceptions",
      "children-design",
      "automated-decisions",
    ]) {
      expect(source(id)?.effective.from).toBe("2026-02-05");
    }
    expect(source("biometric-notification")?.effective.from).toBe("2013-09-01");
    expect(source("joint-controller")?.effective).toMatchObject({
      from: null,
      currentAsOf: "2026-10-15",
    });
  });
});
