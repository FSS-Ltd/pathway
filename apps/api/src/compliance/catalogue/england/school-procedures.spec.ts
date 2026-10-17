import { catalogueSchema } from "../schema";
import { evaluateCondition } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";
import { schoolProcedureSources } from "./school-procedure-sources";
import { schoolProcedureRequirements } from "./school-procedures";

const location = { countryCode: "GB", subdivisionCode: "GB-ENG" };
describe("England school procedural assessments", () => {
  it("validates four bounded assessments and their current sources", () => {
    expect(schoolProcedureRequirements).toHaveLength(4);
    const parsed = catalogueSchema.safeParse({
      schemaVersion: 1,
      version: "school-procedures-test",
      releasedAt: "2026-10-15",
      sources: schoolProcedureSources,
      requirements: schoolProcedureRequirements,
      coverage: [],
    });
    expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
    for (const row of schoolProcedureRequirements) {
      expect(row.obligationClass).toBe("RECOMMENDATION");
      expect(row.signalKeys).toEqual([]);
      expect(row.sectors).toHaveLength(6);
    }
  });
  it.each([
    ["MAINTAINED", "STATE_SCHOOL", [true, true, true, true]],
    ["ACADEMY", "STATE_SCHOOL", [false, true, false, true]],
    ["INDEPENDENT", "INDEPENDENT_SCHOOL", [false, false, false, true]],
    ["NOT_SCHOOL", "OUT_OF_SCHOOL", [false, false, false, false]],
  ] as const)(
    "respects actual %s classification",
    (schoolCategory, providerCategory, expected) => {
      schoolProcedureRequirements.forEach((row, index) => {
        expect(
          evaluateCondition(
            row.condition,
            { ...testProfile, schoolCategory, providerCategory },
            location,
          ),
        ).toBe(expected[index] ? "APPLICABLE" : "NOT_APPLICABLE");
      });
    },
  );
  it("does not infer legal status from screens or funding", () => {
    for (const row of schoolProcedureRequirements)
      expect(
        evaluateCondition(
          row.condition,
          { ...testProfile, schoolCategory: null, providerCategory: null },
          location,
        ),
      ).toBe("UNRESOLVED");
  });
  it("keeps the 2027 assessment year and original commencement distinct", () => {
    const ara = schoolProcedureSources.filter((source) =>
      source.id.includes("2027"),
    );
    expect(ara).toHaveLength(2);
    for (const source of ara) {
      expect(source.publishedAt).toBe("2026-10-12");
      expect(source.effective.from).toBeNull();
      expect(source.effective.currentAsOf).toBe("2026-10-15");
    }
  });
});
