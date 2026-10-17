import { catalogueSchema, type CatalogueRequirement } from "../schema";
import { evaluateCondition, getCurrentRequirement } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";
import { educationSources } from "./education-sources";
import { registrationRequirements } from "./registration";
import { educationRequirements } from "./education";
import { safeguardingRequirements } from "./safeguarding";
import { personnelRequirements } from "./personnel";

const requirements = [
  ...registrationRequirements,
  ...educationRequirements,
  ...safeguardingRequirements,
  ...personnelRequirements,
];
const location = { countryCode: "GB", subdivisionCode: "GB-WLS" };
const now = new Date("2026-10-18T12:00:00Z");
function item(id: string): CatalogueRequirement {
  const requirement = requirements.find((entry) => entry.id === id);
  if (!requirement) throw new Error(`Missing Wales action ${id}`);
  return requirement;
}
function catalogue() {
  return catalogueSchema.parse({
    schemaVersion: 1,
    version: "wales-domain-test",
    releasedAt: "2026-10-17",
    sources: educationSources,
    requirements,
    coverage: [],
  });
}
describe("Wales education, safeguarding and personnel routes", () => {
  it("validates published actions and their source references", () => {
    expect(catalogue().requirements.length).toBeGreaterThan(0);
    expect(
      catalogue().requirements.every((r) => r.jurisdiction === "GB-WLS"),
    ).toBe(true);
  });
  it.each(["SCHOOL", "CHURCH", "CHARITY", "CLUB", "LEARNING_CENTRE"] as const)(
    "uses actual independent-school provision within %s",
    (sector) => {
      expect(
        evaluateCondition(
          item("wal.independent-registration").condition,
          { ...testProfile, sector },
          location,
        ),
      ).toBe("APPLICABLE");
    },
  );
  it("includes nursery sector without inferring school status from a nursery screen", () => {
    expect(item("wal.independent-registration").sectors).toContain("NURSERY");
    expect(
      evaluateCondition(
        item("wal.independent-registration").condition,
        {
          ...testProfile,
          vertical: "NURSERY",
          providerCategory: "EARLY_YEARS",
        },
        location,
      ),
    ).toBe("NOT_APPLICABLE");
  });
  it("does not activate Welsh school duties through English-only profile fields", () => {
    const profile = {
      ...testProfile,
      providerCategory: null,
      schoolCategory: "ACADEMY" as const,
      eyfsApplies: true,
    };
    expect(
      evaluateCondition(
        item("wal.school-safeguarding").condition,
        profile,
        location,
      ),
    ).toBe("UNRESOLVED");
    expect(
      evaluateCondition(
        item("wal.childcare-registration-assessment").condition,
        { ...profile, childcare: false },
        location,
      ),
    ).toBe("NOT_APPLICABLE");
  });
  it("keeps non-school, funded nursery and childcare legal routes conditional", () => {
    expect(
      evaluateCondition(
        item("wal.maintained-curriculum-route").condition,
        {
          ...testProfile,
          providerCategory: "OUT_OF_SCHOOL",
          fundingStatus: "PUBLIC",
        },
        location,
      ),
    ).toBe("NOT_APPLICABLE");
    expect(item("wal.nursery-curriculum-assessment").obligationClass).toBe(
      "RECOMMENDATION",
    );
    expect(item("wal.childcare-standards-assessment").obligationClass).toBe(
      "RECOMMENDATION",
    );
    expect(
      evaluateCondition(
        item("wal.childcare-standards-assessment").condition,
        { ...testProfile, childcare: null },
        location,
      ),
    ).toBe("UNRESOLVED");
  });
  it("does not prescribe child-facing DBS assessment to adult-only provision", () => {
    expect(
      evaluateCondition(
        item("wal.dbs-role-assessment").condition,
        { ...testProfile, minimumAge: 18 },
        location,
      ),
    ).toBe("NOT_APPLICABLE");
    expect(
      evaluateCondition(
        item("wal.dbs-role-assessment").condition,
        { ...testProfile, minimumAge: null },
        location,
      ),
    ).toBe("UNRESOLVED");
    expect(item("wal.dbs-role-assessment").obligationClass).toBe(
      "RECOMMENDATION",
    );
  });
  it("expires Welsh statutory check actions when source review expires", () => {
    const current = catalogue();
    expect(
      getCurrentRequirement(current, "wal.independent-check-renewal", 1, now),
    ).not.toBeNull();
    expect(
      getCurrentRequirement(
        current,
        "wal.independent-check-renewal",
        1,
        new Date("2027-01-13T12:00:00Z"),
      ),
    ).toBeNull();
  });
});
