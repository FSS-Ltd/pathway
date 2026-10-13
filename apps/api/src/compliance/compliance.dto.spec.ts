import {
  complianceRecordInputSchema,
  complianceUpdateSchema,
  complianceListSchema,
} from "./compliance.dto";

const input = {
  subjectName: "Test colleague",
  subjectUserId: null,
  roleDescription: "Volunteer tutor",
  kind: "BACKGROUND_CHECK",
  scheme: "DBS",
  title: "Enhanced check",
  provider: null,
  reference: null,
  completedOn: "2025-01-15",
  reviewDueOn: null,
  status: "RECORDED",
  notes: null,
  verificationNotes: null,
};

describe("personnel compliance input boundaries", () => {
  it("permits a certificate with no expiry or review date", () => {
    expect(complianceRecordInputSchema.parse(input).reviewDueOn).toBeNull();
  });
  it.each(["2025-02-30", "2025-13-01", "2099-01-01", "01/01/2025"])(
    "rejects invalid or future completion date %s",
    (completedOn) => {
      expect(
        complianceRecordInputSchema.safeParse({ ...input, completedOn })
          .success,
      ).toBe(false);
    },
  );
  it("requires actual verification notes and completion before verification", () => {
    expect(
      complianceRecordInputSchema.safeParse({ ...input, status: "VERIFIED" })
        .success,
    ).toBe(false);
    expect(
      complianceRecordInputSchema.safeParse({
        ...input,
        status: "VERIFIED",
        verificationNotes: "Original certificate inspected",
      }).success,
    ).toBe(true);
    expect(
      complianceRecordInputSchema.safeParse({ ...input, completedOn: null })
        .success,
    ).toBe(false);
  });
  it("requires a check scheme only for a background check", () => {
    expect(
      complianceRecordInputSchema.safeParse({ ...input, scheme: null }).success,
    ).toBe(false);
    expect(
      complianceRecordInputSchema.safeParse({ ...input, kind: "FIRST_AID" })
        .success,
    ).toBe(false);
    expect(
      complianceRecordInputSchema.safeParse({
        ...input,
        kind: "FIRST_AID",
        scheme: null,
      }).success,
    ).toBe(true);
  });
  it("does not accept actor, site, verification stamps or version from create input", () => {
    for (const key of [
      "tenantId",
      "orgId",
      "verifiedByUserId",
      "verifiedAt",
      "version",
    ]) {
      expect(
        complianceRecordInputSchema.safeParse({ ...input, [key]: "injected" })
          .success,
      ).toBe(false);
    }
  });
  it("requires a positive integer version for updates", () => {
    expect(complianceUpdateSchema.safeParse(input).success).toBe(false);
    expect(
      complianceUpdateSchema.safeParse({ ...input, expectedVersion: 1 })
        .success,
    ).toBe(true);
    expect(
      complianceUpdateSchema.safeParse({ ...input, expectedVersion: 0 })
        .success,
    ).toBe(false);
  });
  it("parses false explicitly and rejects ambiguous query flags", () => {
    expect(
      complianceListSchema.parse({ includeArchived: "false" }).includeArchived,
    ).toBe(false);
    expect(
      complianceListSchema.safeParse({ includeArchived: "yes" }).success,
    ).toBe(false);
  });
});
