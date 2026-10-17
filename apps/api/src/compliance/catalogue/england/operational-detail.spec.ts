import { catalogueSchema } from "../schema";
import { evaluateCondition } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";
import { operationalDetailSources } from "./operational-detail-sources";
import { premisesDetailRequirements } from "./premises-detail";
import { activityDetailRequirements } from "./activity-detail";

const requirements = [
  ...premisesDetailRequirements,
  ...activityDetailRequirements,
];
const location = { countryCode: "GB", subdivisionCode: "GB-ENG" };
function item(id: string) {
  const found = requirements.find((entry) => entry.id === `eng-detail-${id}`);
  if (!found) throw new Error(`Missing requirement: ${id}`);
  return found;
}
describe("England operational detail applicability", () => {
  it("validates all source references and bounded publication metadata", () => {
    expect(
      catalogueSchema.safeParse({
        schemaVersion: 1,
        version: "operations-detail-test",
        releasedAt: "2026-10-15",
        sources: operationalDetailSources,
        requirements,
        coverage: [],
      }).success,
    ).toBe(true);
  });
  it.each(["asbestos", "legionella", "gas", "equipment"])(
    "preserves responsibility uncertainty for %s",
    (id) => {
      const condition = item(id).condition;
      expect(
        evaluateCondition(
          condition,
          { ...testProfile, controlsPremises: null, employsStaff: false },
          location,
        ),
      ).toBe("UNRESOLVED");
      expect(
        evaluateCondition(
          condition,
          { ...testProfile, controlsPremises: false, employsStaff: false },
          location,
        ),
      ).toBe("NOT_APPLICABLE");
      expect(
        evaluateCondition(
          condition,
          { ...testProfile, controlsPremises: true, employsStaff: false },
          location,
        ),
      ).toBe("APPLICABLE");
      expect(item(id).obligationClass).toBe("RECOMMENDATION");
    },
  );
  it.each(["electrical", "coshh"])(
    "does not infer employment for %s from sector or funding",
    (id) => {
      expect(
        evaluateCondition(
          item(id).condition,
          { ...testProfile, employsStaff: null },
          location,
        ),
      ).toBe("UNRESOLVED");
      expect(
        evaluateCondition(
          item(id).condition,
          { ...testProfile, employsStaff: false },
          location,
        ),
      ).toBe("NOT_APPLICABLE");
      expect(
        evaluateCondition(
          item(id).condition,
          { ...testProfile, employsStaff: true },
          location,
        ),
      ).toBe("APPLICABLE");
    },
  );
  it("screens private fostering arrangements without boarding or trips", () => {
    for (const sector of ["CHURCH", "CHARITY", "CLUB"] as const) {
      expect(
        evaluateCondition(
          item("private-fostering").condition,
          { ...testProfile, sector, boarding: false, trips: false },
          location,
        ),
      ).toBe("APPLICABLE");
    }
    expect(
      evaluateCondition(
        item("private-fostering").condition,
        { ...testProfile, boarding: null, trips: null },
        location,
      ),
    ).toBe("APPLICABLE");
    expect(item("private-fostering").obligationClass).toBe("RECOMMENDATION");
  });
  it.each(["adventure", "premises-permissions", "venue-licensing"])(
    "keeps %s screening available without trip, employment or premises-control assumptions",
    (id) => {
      expect(
        evaluateCondition(
          item(id).condition,
          {
            ...testProfile,
            sector: "CLUB",
            trips: false,
            employsStaff: false,
            controlsPremises: false,
          },
          location,
        ),
      ).toBe("APPLICABLE");
      expect(item(id).obligationClass).toBe("RECOMMENDATION");
      expect(item(id).allowsNotApplicable).toBe(false);
    },
  );
});
