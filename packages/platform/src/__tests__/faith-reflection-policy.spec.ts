import {
  canReadReflection,
  canReleaseReflection,
} from "../faith/reflection-policy";

const pending = {
  studentIdentityId: "student-a",
  visibility: "AUTHOR_AND_STAFF" as const,
  moderationStatus: "PENDING" as const,
  guardianReleasedAt: null,
};

describe("Faith reflection audience", () => {
  it("keeps a pending reflection between its student author and staff", () => {
    expect(canReadReflection(pending, { kind: "STAFF" })).toBe(true);
    expect(
      canReadReflection(pending, {
        kind: "STUDENT",
        studentIdentityId: "student-a",
      }),
    ).toBe(true);
    expect(
      canReadReflection(pending, {
        kind: "STUDENT",
        studentIdentityId: "student-b",
      }),
    ).toBe(false);
    expect(
      canReadReflection(pending, {
        kind: "GUARDIAN",
        hasCurrentFullRelationship: true,
      }),
    ).toBe(false);
  });

  it("requires explicit approval, release, and a current full guardian link", () => {
    const released = {
      ...pending,
      visibility: "RELEASED_GUARDIANS" as const,
      moderationStatus: "APPROVED" as const,
      guardianReleasedAt: new Date(),
    };
    expect(canReleaseReflection(pending)).toBe(false);
    expect(
      canReleaseReflection({
        ...released,
        visibility: "AUTHOR_AND_STAFF",
        guardianReleasedAt: null,
      }),
    ).toBe(true);
    expect(
      canReadReflection(released, {
        kind: "GUARDIAN",
        hasCurrentFullRelationship: true,
      }),
    ).toBe(true);
    expect(
      canReadReflection(released, {
        kind: "GUARDIAN",
        hasCurrentFullRelationship: false,
      }),
    ).toBe(false);
  });
});
