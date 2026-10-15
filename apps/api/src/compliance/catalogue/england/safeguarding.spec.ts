import { catalogueSchema } from "../schema";
import { evaluateCondition } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";
import { educationSources } from "./education-sources";
import { safeguardingRequirements, safeguardingSources } from "./safeguarding";
import { personnelRequirements, personnelSources } from "./personnel";

const requirements = [...safeguardingRequirements, ...personnelRequirements];
const location = { countryCode: "GB", subdivisionCode: "GB-ENG" };
function item(id: string) {
  const requirement = requirements.find((entry) => entry.id === id);
  if (!requirement) throw new Error(`Missing fixture requirement ${id}`);
  return requirement;
}
describe("England safeguarding and personnel applicability", () => {
  it("validates source references, publication metadata and every requirement", () => {
    expect(
      catalogueSchema.safeParse({
        schemaVersion: 1,
        version: "safeguarding-test",
        releasedAt: "2026-10-15",
        sources: [
          ...safeguardingSources,
          ...personnelSources,
          ...educationSources.filter((source) =>
            ["eng-eyfs-framework", "eng-independent-school-standards"].includes(
              source.id,
            ),
          ),
        ],
        requirements,
        coverage: [],
      }).success,
    ).toBe(true);
  });
  it.each(["CHURCH", "CHARITY", "CLUB", "SCHOOL", "LEARNING_CENTRE"] as const)(
    "uses actual school classification in %s",
    (sector) => {
      expect(
        evaluateCondition(
          item("eng-school-dsl").condition,
          { ...testProfile, sector },
          location,
        ),
      ).toBe("APPLICABLE");
    },
  );
  it("uses explicit school category when provider classification is not yet populated", () => {
    expect(
      evaluateCondition(
        item("eng-school-dsl").condition,
        { ...testProfile, providerCategory: null, schoolCategory: "ACADEMY" },
        location,
      ),
    ).toBe("APPLICABLE");
  });
  it("does not derive school or EYFS duties from a learning centre screen or young ages", () => {
    const profile = {
      ...testProfile,
      sector: "LEARNING_CENTRE" as const,
      vertical: "PUBLIC_LEARNING_CENTRE" as const,
      providerCategory: "OUT_OF_SCHOOL" as const,
      schoolCategory: "NOT_SCHOOL" as const,
      minimumAge: 3,
    };
    expect(
      evaluateCondition(item("eng-school-dsl").condition, profile, location),
    ).toBe("NOT_APPLICABLE");
    expect(
      evaluateCondition(
        item("eng-eyfs-suitability").condition,
        profile,
        location,
      ),
    ).toBe("UNRESOLVED");
    expect(
      evaluateCondition(
        item("eng-eyfs-suitability").condition,
        { ...profile, eyfsApplies: false },
        location,
      ),
    ).toBe("NOT_APPLICABLE");
    expect(
      evaluateCondition(
        item("eng-eyfs-suitability").condition,
        { ...profile, eyfsApplies: true },
        location,
      ),
    ).toBe("APPLICABLE");
  });
  it("requires actual child-facing ages for community actions but retains adult charity safeguarding", () => {
    const profile = {
      ...testProfile,
      providerCategory: "OUT_OF_SCHOOL" as const,
      charitable: true,
      minimumAge: 18,
    };
    expect(
      evaluateCondition(
        item("eng-out-of-school-safeguarding").condition,
        profile,
        location,
      ),
    ).toBe("NOT_APPLICABLE");
    expect(
      evaluateCondition(
        item("eng-out-of-school-safeguarding").condition,
        { ...profile, minimumAge: null },
        location,
      ),
    ).toBe("UNRESOLVED");
    expect(
      evaluateCondition(
        item("eng-charity-safeguarding-oversight").condition,
        profile,
        location,
      ),
    ).toBe("APPLICABLE");
  });
  it("keeps role-dependent DBS assessments recommendations and prevents automatic screening", () => {
    expect(item("eng-dbs-eligibility-assessment").obligationClass).toBe(
      "RECOMMENDATION",
    );
    expect(item("eng-dbs-referral-procedure").obligationClass).toBe(
      "RECOMMENDATION",
    );
    expect(
      item("eng-dbs-eligibility-assessment").expectedEvidence.join(" "),
    ).toContain("no official expiry");
    expect(
      item("eng-dbs-referral-procedure").applicabilityExplanation,
    ).toContain("Dismissal alone is insufficient");
  });
});
