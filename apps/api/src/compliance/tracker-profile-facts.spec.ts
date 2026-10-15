import { conditionSchema } from "./catalogue/conditions";
import { evaluateCondition } from "./tracker-engine";
import { trackerProfileInput, normalizeTrackerProfile } from "./tracker.dto";
import { serializeTrackerProfile } from "./tracker-record";
import { testProfile } from "./tests/tracker-fixture";

const facts = [
  "englandSchoolMedicalDutiesApply",
  "personalDataController",
  "employsStaff",
  "controlsPremises",
  "foodBusiness",
  "operatesVehicles",
  "eyfsApplies",
] as const;
const location = { countryCode: "GB", subdivisionCode: "GB-ENG" };
describe("Optional compliance profile facts", () => {
  it("normalizes legacy input and stored JSON to unknown without inferring school status", () => {
    const parsed = normalizeTrackerProfile(testProfile);
    expect(
      trackerProfileInput.parse(testProfile).schoolCategory,
    ).toBeUndefined();
    for (const field of facts) expect(parsed[field]).toBeNull();
    expect(parsed.schoolCategory).toBeNull();
    expect(
      serializeTrackerProfile({
        id: "profile",
        orgId: "org",
        tenantId: "site",
        jurisdictionId: null,
        updatedByUserId: "user",
        createdAt: new Date("2026-10-15"),
        profileJson: JSON.stringify(testProfile),
        version: 3,
        updatedAt: new Date("2026-10-15"),
      }).profile,
    ).toEqual(parsed);
  });
  it("preserves omitted facts and explicit undefined while allowing explicit null", () => {
    const current = normalizeTrackerProfile({
      ...testProfile,
      schoolCategory: "INDEPENDENT",
      employsStaff: true,
    });
    expect(
      normalizeTrackerProfile(
        { ...testProfile, employsStaff: undefined },
        current,
      ),
    ).toEqual(current);
    expect(
      normalizeTrackerProfile({ ...testProfile, employsStaff: null }, current)
        .employsStaff,
    ).toBeNull();
    expect(() =>
      normalizeTrackerProfile(
        { ...testProfile, providerCategory: "STATE_SCHOOL" },
        current,
      ),
    ).toThrow("Bad Request");
    expect(() =>
      normalizeTrackerProfile({ employsStaff: true }, current),
    ).toThrow("Bad Request");
  });
  it.each(facts)(
    "keeps %s omission/null unresolved and false distinct from true",
    (field) => {
      const condition = conditionSchema.parse({ field, op: "eq", value: true });
      expect(evaluateCondition(condition, testProfile, location)).toBe(
        "UNRESOLVED",
      );
      expect(
        evaluateCondition(
          condition,
          { ...testProfile, [field]: null },
          location,
        ),
      ).toBe("UNRESOLVED");
      expect(
        evaluateCondition(
          condition,
          { ...testProfile, [field]: false },
          location,
        ),
      ).toBe("NOT_APPLICABLE");
      expect(
        evaluateCondition(
          condition,
          { ...testProfile, [field]: true },
          location,
        ),
      ).toBe("APPLICABLE");
      expect(
        trackerProfileInput.safeParse({ ...testProfile, [field]: "false" })
          .success,
      ).toBe(false);
      expect(
        conditionSchema.safeParse({ field, op: "eq", value: "false" }).success,
      ).toBe(false);
    },
  );
  it.each([
    ["INDEPENDENT_SCHOOL", "MAINTAINED"],
    ["INDEPENDENT_SCHOOL", "ACADEMY"],
    ["INDEPENDENT_SCHOOL", "NOT_SCHOOL"],
    ["STATE_SCHOOL", "INDEPENDENT"],
    ["STATE_SCHOOL", "NOT_SCHOOL"],
  ])("rejects contradictory %s / %s", (providerCategory, schoolCategory) => {
    expect(
      trackerProfileInput.safeParse({
        ...testProfile,
        providerCategory,
        schoolCategory,
      }).success,
    ).toBe(false);
  });
  it.each([
    ["INDEPENDENT_SCHOOL", "INDEPENDENT"],
    ["STATE_SCHOOL", "MAINTAINED"],
    ["STATE_SCHOOL", "ACADEMY"],
    ["EARLY_YEARS", "MAINTAINED"],
    [null, "NOT_SCHOOL"],
    ["STATE_SCHOOL", null],
  ])(
    "accepts explicit or unresolved %s / %s without funding inference",
    (providerCategory, schoolCategory) => {
      expect(
        trackerProfileInput.safeParse({
          ...testProfile,
          providerCategory,
          schoolCategory,
        }).success,
      ).toBe(true);
    },
  );
  it("validates school condition values and preserves unresolved classifications", () => {
    const condition = conditionSchema.parse({
      field: "schoolCategory",
      op: "eq",
      value: "INDEPENDENT",
    });
    expect(evaluateCondition(condition, testProfile, location)).toBe(
      "UNRESOLVED",
    );
    expect(
      evaluateCondition(
        condition,
        { ...testProfile, schoolCategory: "INDEPENDENT" },
        location,
      ),
    ).toBe("APPLICABLE");
    expect(
      evaluateCondition(
        condition,
        { ...testProfile, schoolCategory: "NOT_SCHOOL" },
        location,
      ),
    ).toBe("NOT_APPLICABLE");
    expect(
      conditionSchema.safeParse({
        field: "schoolCategory",
        op: "eq",
        value: "PUBLIC",
      }).success,
    ).toBe(false);
    expect(
      trackerProfileInput.safeParse({
        ...testProfile,
        schoolCategory: "PUBLIC",
      }).success,
    ).toBe(false);
  });
});
