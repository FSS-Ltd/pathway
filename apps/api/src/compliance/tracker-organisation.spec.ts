import { applyOrganisationFacts } from "./tracker-organisation";
import { testProfile } from "./tests/tracker-fixture";

describe("organisation facts for site compliance", () => {
  it("uses the saved organisation sector and product type without inventing legal status", () => {
    const result = applyOrganisationFacts(
      { ...testProfile, sector: null, vertical: null, ace: null },
      { sector: "SCHOOL", vertical: "ACE_SCHOOL", ace: true },
    );
    expect(result).toMatchObject({
      sector: "SCHOOL",
      vertical: "ACE_SCHOOL",
      ace: true,
      providerCategory: "INDEPENDENT_SCHOOL",
      fundingStatus: "PRIVATE",
    });
    expect(result.jurisdictionId).toBe(testProfile.jurisdictionId);
  });

  it("does not infer non-ACE participation or funding from a public learning-centre screen", () => {
    const result = applyOrganisationFacts(
      {
        ...testProfile,
        ace: null,
        fundingStatus: null,
        providerCategory: null,
      },
      {
        sector: "LEARNING_CENTRE",
        vertical: "PUBLIC_LEARNING_CENTRE",
        ace: null,
      },
    );
    expect(result).toMatchObject({
      sector: "LEARNING_CENTRE",
      vertical: "PUBLIC_LEARNING_CENTRE",
      ace: null,
      fundingStatus: null,
      providerCategory: null,
    });
  });
});
