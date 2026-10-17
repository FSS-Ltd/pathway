import { catalogueSchema } from "../schema";
import { currentSource } from "../current";
import { evaluateCondition } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";
import { educationSources } from "./education-sources";
import { stateSchoolSources } from "./state-school-sources";
import { stateSchoolRequirements } from "./state-schools";

const location = { countryCode: "GB", subdivisionCode: "GB-ENG" };
function requirement(id: string) {
  const result = stateSchoolRequirements.find((row) => row.id === id);
  if (!result) throw new Error(`Missing requirement ${id}`);
  return result;
}
describe("England state-school operational duties", () => {
  it("validates requirements and reviewed source references", () => {
    const references = new Set(
      stateSchoolRequirements.flatMap((row) => row.sourceIds),
    );
    const sources = [
      ...stateSchoolSources,
      ...educationSources.filter((row) => references.has(row.id)),
    ];
    const result = catalogueSchema.safeParse({
      schemaVersion: 1,
      version: "state-school-test",
      releasedAt: "2026-10-15",
      requirements: stateSchoolRequirements,
      sources,
      coverage: [],
    });
    expect(result.success ? [] : result.error.issues).toEqual([]);
    expect(sources.every((source) => currentSource(source, "2026-10-15"))).toBe(
      true,
    );
  });
  it("does not infer maintained or academy duties from a state-school provider or public funding", () => {
    const profile = {
      ...testProfile,
      providerCategory: "STATE_SCHOOL" as const,
      fundingStatus: "PUBLIC" as const,
      schoolCategory: null,
    };
    for (const row of stateSchoolRequirements)
      expect(evaluateCondition(row.condition, profile, location)).toBe(
        "UNRESOLVED",
      );
  });
  it.each(["CHURCH", "CLUB", "CHARITY", "SCHOOL", "LEARNING_CENTRE"] as const)(
    "applies actual maintained status in sector %s",
    (sector) => {
      const profile = {
        ...testProfile,
        sector,
        schoolCategory: "MAINTAINED" as const,
        providerCategory: "STATE_SCHOOL" as const,
      };
      expect(
        evaluateCondition(
          requirement("eng.maintained-complaints").condition,
          profile,
          location,
        ),
      ).toBe("APPLICABLE");
      expect(
        evaluateCondition(
          requirement("eng.academy-complaints-route").condition,
          profile,
          location,
        ),
      ).toBe("NOT_APPLICABLE");
    },
  );
  it("includes maintained nursery complaints and balanced curriculum without a national-curriculum age inference", () => {
    const profile = {
      ...testProfile,
      providerCategory: "EARLY_YEARS" as const,
      schoolCategory: "MAINTAINED" as const,
      minimumAge: 2,
      maximumAge: 4,
    };
    expect(
      evaluateCondition(
        requirement("eng.maintained-complaints").condition,
        profile,
        location,
      ),
    ).toBe("APPLICABLE");
    expect(
      evaluateCondition(
        requirement("eng.maintained-curriculum").condition,
        profile,
        location,
      ),
    ).toBe("APPLICABLE");
    expect(
      requirement("eng.maintained-curriculum").applicabilityExplanation,
    ).toContain(
      "Nursery-only provision is not required to teach all national curriculum subjects",
    );
  });
  it("preserves academy subtype assessments and does not activate prospective national curriculum law", () => {
    const profile = { ...testProfile, schoolCategory: "ACADEMY" as const };
    for (const id of [
      "eng.academy-curriculum",
      "eng.academy-complaints-route",
      "eng.state-send-support-assessment",
      "eng.state-admissions-assessment",
    ]) {
      const row = requirement(id);
      expect(evaluateCondition(row.condition, profile, location)).toBe(
        "APPLICABLE",
      );
      expect(row.obligationClass).toBe("RECOMMENDATION");
    }
    expect(
      requirement("eng.academy-curriculum").applicabilityExplanation,
    ).toContain("not yet commenced");
    expect(
      requirement("eng.academy-complaints-route").applicabilityExplanation,
    ).toContain("other than 16–19 academies");
  });
  it("assesses section 41 and EHCP naming without asserting every independent school must admit", () => {
    const row = requirement("eng.school-ehcp-admission-assessment");
    expect(evaluateCondition(row.condition, testProfile, location)).toBe(
      "APPLICABLE",
    );
    expect(row.obligationClass).toBe("RECOMMENDATION");
    expect(row.applicabilityExplanation).toContain("section 41-approved");
    expect(row.applicabilityExplanation).toContain("actual naming decision");
  });
  it("records the current cooperation commencement and all six research sectors", () => {
    expect(
      stateSchoolSources.find(
        (source) => source.id === "eng-state-la-cooperation",
      )?.effective.from,
    ).toBe("2026-06-29");
    for (const row of stateSchoolRequirements)
      expect(row.sectors).toEqual([
        "SCHOOL",
        "NURSERY",
        "CHURCH",
        "CHARITY",
        "CLUB",
        "LEARNING_CENTRE",
      ]);
  });
});
