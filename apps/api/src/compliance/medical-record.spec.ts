import { medicalField, medicalStorageValue } from "./medical-record";
import { medicalUpdateSchema } from "./medical.dto";

describe("medical information states", () => {
  it.each([
    "v1:malformed",
    "v1:aXY=:dGFn:Y2lwaGVy",
    "  v1:remaining-envelope  ",
  ])(
    "never presents remaining encrypted values as clinical information: %s",
    (value) => {
      expect(medicalField(value, true)).toEqual({
        status: "UNAVAILABLE",
        details: null,
      });
      expect(medicalField(value, false)).toEqual({
        status: "UNAVAILABLE",
        details: null,
      });
    },
  );
  it("does not treat legacy defaults as confirmed absence", () => {
    expect(medicalField("none", false)).toEqual({
      status: "UNKNOWN",
      details: null,
    });
    expect(medicalField("none", true)).toEqual({
      status: "NONE",
      details: null,
    });
    expect(medicalField(" Peanut allergy ", false)).toEqual({
      status: "RECORDED",
      details: "Peanut allergy",
    });
    for (const value of [null, "", "unknown"])
      expect(medicalField(value, true).status).toBe("UNKNOWN");
  });
  it("preserves unknown and explicit absence separately", () => {
    expect(
      medicalStorageValue({ status: "UNKNOWN", details: null }),
    ).toBeNull();
    expect(medicalStorageValue({ status: "NONE", details: null })).toBe("none");
    expect(medicalStorageValue({ status: "RECORDED", details: "Asthma" })).toBe(
      "Asthma",
    );
  });
  it("rejects ambiguous recorded text and spoofed scope", () => {
    const input = {
      expectedUpdatedAt: new Date().toISOString(),
      allergies: { status: "UNKNOWN", details: null },
      medicalConditions: { status: "NONE", details: null },
      medicationAtSite: { status: "NONE", details: null },
    };
    expect(medicalUpdateSchema.safeParse(input).success).toBe(true);
    expect(
      medicalUpdateSchema.safeParse({
        ...input,
        allergies: { status: "UNAVAILABLE", details: null },
      }).success,
    ).toBe(false);
    for (const details of [
      "none",
      "unknown",
      "   ",
      "v1:malformed",
      "  v1:aXY=:dGFn:Y2lwaGVy  ",
    ])
      expect(
        medicalUpdateSchema.safeParse({
          ...input,
          allergies: { status: "RECORDED", details },
        }).success,
      ).toBe(false);
    expect(
      medicalUpdateSchema.safeParse({ ...input, tenantId: "spoof" }).success,
    ).toBe(false);
  });
});
