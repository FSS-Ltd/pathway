import { pendingOrganisationProfile } from "../pending-organisation-profile";

describe("pending organisation identity", () => {
  it.each(["ACE_LEARNING_CENTRE", "PUBLIC_LEARNING_CENTRE"] as const)(
    "retains %s after freezing checkout",
    (vertical) => {
      expect(
        pendingOrganisationProfile(
          { sector: "LEARNING_CENTRE", vertical },
          vertical,
        ),
      ).toEqual({ sector: "LEARNING_CENTRE", vertical });
    },
  );
  it("retains legacy sector-only orders without inventing a school type", () => {
    expect(pendingOrganisationProfile({ sector: "SCHOOL" })).toEqual({
      sector: "SCHOOL",
      vertical: undefined,
    });
    expect(pendingOrganisationProfile({ sector: "" })).toEqual({
      sector: undefined,
      vertical: undefined,
    });
  });
  it("recovers the frozen setting for older public institutional orders", () => {
    expect(
      pendingOrganisationProfile({ sector: "SCHOOL" }, "ACE_SCHOOL"),
    ).toEqual({ sector: "SCHOOL", vertical: "ACE_SCHOOL" });
  });
  it.each([
    { sector: "LEARNING_CENTRE" },
    { sector: "SCHOOL", vertical: "ACE_LEARNING_CENTRE" },
    { sector: "LEARNING_CENTRE", vertical: "STATE_SCHOOL" },
    { sector: "SCHOOL", vertical: "HOME_EDUCATION" },
    { sector: "SCHOOL", vertical: "constructor" },
  ])(
    "rejects inconsistent provider details before creating an org: %j",
    (details) => {
      expect(() => pendingOrganisationProfile(details)).toThrow();
    },
  );
  it("rejects a mismatch between frozen and stored types", () => {
    expect(() =>
      pendingOrganisationProfile(
        { sector: "LEARNING_CENTRE", vertical: "ACE_LEARNING_CENTRE" },
        "PUBLIC_LEARNING_CENTRE",
      ),
    ).toThrow("requires review");
  });
});
