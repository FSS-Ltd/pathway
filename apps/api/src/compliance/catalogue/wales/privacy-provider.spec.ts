import { catalogueSchema } from "../schema";
import { evaluateCondition } from "../../tracker-engine";
import { testProfile } from "../../tests/tracker-fixture";
import { privacySources } from "./privacy-sources";
import { privacyRequirements } from "./privacy";
import { icceRequirements, icceSources } from "./icce";

const location = { countryCode: "GB", subdivisionCode: "GB-WLS" };
const sources = [...privacySources, ...icceSources];
const requirements = [...privacyRequirements, ...icceRequirements];

describe("Wales privacy and provider applicability", () => {
  it("publishes reviewed Wales-only revisions with complete source links", () => {
    expect(
      catalogueSchema.safeParse({
        schemaVersion: 1,
        version: "wales-privacy-provider-test",
        releasedAt: "2026-10-17",
        sources,
        requirements,
        coverage: [],
      }).success,
    ).toBe(true);
    for (const requirement of requirements) {
      expect(requirement.id).toMatch(/^wal-/);
      expect(requirement.jurisdiction).toBe("GB-WLS");
      expect(requirement.sectors).toContain("NURSERY");
      expect(requirement.effective.from).toBe("2026-10-17");
      expect(requirement.allowsNotApplicable).toBe(false);
    }
    for (const source of sources) {
      expect(source.id).toMatch(/^wal-/);
      expect(source.territory).toEqual(["GB-WLS"]);
      expect(source.retrievedAt).toBe("2026-10-17");
      expect(source.effective.currentAsOf).toBe("2026-10-17");
      expect(source.review.reviewDueAt).toBe("2027-01-12");
    }
  });

  it.each([
    "SCHOOL",
    "NURSERY",
    "CHURCH",
    "CHARITY",
    "CLUB",
    "LEARNING_CENTRE",
  ] as const)(
    "keeps controller duties conditional and role assessment available for %s",
    (sector) => {
      expect(
        requirements.every((requirement) =>
          requirement.sectors.includes(sector),
        ),
      ).toBe(true);
      for (const requirement of privacyRequirements) {
        const unconditional = requirement.id === "wal-privacy-role-review";
        expect(
          evaluateCondition(
            requirement.condition,
            { ...testProfile, personalDataController: true },
            location,
          ),
        ).toBe("APPLICABLE");
        expect(
          evaluateCondition(
            requirement.condition,
            { ...testProfile, personalDataController: false },
            location,
          ),
        ).toBe(unconditional ? "APPLICABLE" : "NOT_APPLICABLE");
        expect(
          evaluateCondition(
            requirement.condition,
            { ...testProfile, personalDataController: null },
            location,
          ),
        ).toBe(unconditional ? "APPLICABLE" : "UNRESOLVED");
      }
    },
  );

  it("does not label unknown DPO, fee or sensitive-processing triggers as universal duties", () => {
    for (const id of [
      "wal-privacy-sensitive-assessment",
      "wal-privacy-accountability-assessment",
    ])
      expect(
        privacyRequirements.find((value) => value.id === id)?.obligationClass,
      ).toBe("RECOMMENDATION");
    expect(
      privacySources.find((source) => source.id === "wal-privacy-rights-period")
        ?.effective.from,
    ).toBe("2026-02-05");
    expect(
      privacySources.find((source) => source.id === "wal-privacy-complaints")
        ?.effective.from,
    ).toBe("2026-06-19");
  });

  it("selects ICCE requirements independently of ACE participation", () => {
    const providerRequirements = icceRequirements.filter(
      (value) => value.obligationClass === "PROVIDER_REQUIREMENT",
    );
    expect(providerRequirements).toHaveLength(4);
    for (const requirement of providerRequirements) {
      expect(
        evaluateCondition(
          requirement.condition,
          { ...testProfile, ace: true, icce: false },
          location,
        ),
      ).toBe("NOT_APPLICABLE");
      expect(
        evaluateCondition(
          requirement.condition,
          { ...testProfile, ace: false, icce: true },
          location,
        ),
      ).toBe("APPLICABLE");
      expect(
        evaluateCondition(
          requirement.condition,
          { ...testProfile, ace: true, icce: null },
          location,
        ),
      ).toBe("UNRESOLVED");
      expect(
        requirement.sourceIds.every(
          (id) =>
            icceSources.find((source) => source.id === id)?.classification ===
            "PROVIDER",
        ),
      ).toBe(true);
    }
    const aceReview = icceRequirements.find(
      (value) => value.id === "wal-ace-agreement-review",
    );
    expect(aceReview?.obligationClass).toBe("RECOMMENDATION");
    expect(
      evaluateCondition(
        aceReview?.condition ?? null,
        { ...testProfile, ace: true, icce: false },
        location,
      ),
    ).toBe("APPLICABLE");
    expect(
      evaluateCondition(
        aceReview?.condition ?? null,
        { ...testProfile, ace: false, icce: true },
        location,
      ),
    ).toBe("NOT_APPLICABLE");
  });
});
