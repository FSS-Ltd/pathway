import { evaluateCondition } from "./tracker-engine";
import {
  trackerProfileInput,
  trackerAttestationInput,
  trackerEvidenceInput,
  trackerArchiveInput,
} from "./tracker.dto";
import { testProfile } from "./tests/tracker-fixture";
describe("Tracker boundary validation", () => {
  it("treats blank regional information as unknown for applicability", () => {
    const profile = trackerProfileInput.parse({
      ...testProfile,
      region: "  ",
      localAuthority: "",
    });
    expect(profile.region).toBeNull();
    expect(profile.localAuthority).toBeNull();
    expect(
      evaluateCondition(
        { field: "region", op: "eq", value: "Bavaria" },
        profile,
        { countryCode: "DE", subdivisionCode: null },
      ),
    ).toBe("UNRESOLVED");
  });
  it("keeps Belgian Community separate from location and validates its values", () => {
    const profile = trackerProfileInput.parse({
      ...testProfile,
      belgianEducationCommunity: "FRENCH",
    });
    expect(
      evaluateCondition(
        { field: "belgianEducationCommunity", op: "eq", value: "FRENCH" },
        profile,
        { countryCode: "BE", subdivisionCode: "BE1" },
      ),
    ).toBe("APPLICABLE");
    expect(
      evaluateCondition(
        { field: "belgianEducationCommunity", op: "eq", value: "FRENCH" },
        { ...profile, belgianEducationCommunity: null },
        { countryCode: "BE", subdivisionCode: "BE1" },
      ),
    ).toBe("UNRESOLVED");
    expect(
      trackerProfileInput.safeParse({
        ...testProfile,
        belgianEducationCommunity: "BRUSSELS",
      }).success,
    ).toBe(false);
  });
  it("validates independent Belgian childcare facts", () => {
    const profile = trackerProfileInput.parse({
      ...testProfile,
      belgianEducationCommunity: "FRENCH",
      belgianChildcareAuthority: "IRISCARE",
      belgianPaidUnderThreeCare: true,
    });
    expect(
      evaluateCondition(
        { field: "belgianChildcareAuthority", op: "eq", value: "IRISCARE" },
        profile,
        { countryCode: "BE", subdivisionCode: "BE1" },
      ),
    ).toBe("APPLICABLE");
    expect(
      trackerProfileInput.safeParse({
        ...testProfile,
        belgianChildcareAuthority: "BRUSSELS",
      }).success,
    ).toBe(false);
  });
  it("validates Belgian school recognition independently of funding", () => {
    const profile = trackerProfileInput.parse({
      ...testProfile,
      belgianEducationCommunity: "FLEMISH",
      belgianSchoolRecognitionStatus: "COMMUNITY_RECOGNISED",
      fundingStatus: "PRIVATE",
    });
    expect(profile.belgianSchoolRecognitionStatus).toBe("COMMUNITY_RECOGNISED");
    expect(
      trackerProfileInput.safeParse({
        ...testProfile,
        belgianSchoolRecognitionStatus: "FUNDED",
      }).success,
    ).toBe(false);
  });
  it("rejects caller scope on archive", () => {
    expect(
      trackerArchiveInput.safeParse({ tenantId: "injected" }).success,
    ).toBe(false);
    expect(trackerArchiveInput.parse(undefined)).toEqual({});
  });
  it("keeps legal status and funding unknown for public learning centres", () => {
    expect(
      trackerProfileInput.parse({
        ...testProfile,
        sector: "LEARNING_CENTRE",
        vertical: "PUBLIC_LEARNING_CENTRE",
        providerCategory: null,
        fundingStatus: null,
      }),
    ).toMatchObject({ providerCategory: null, fundingStatus: null });
    expect(
      trackerProfileInput.safeParse({ ...testProfile, sector: "CLUB" }).success,
    ).toBe(false);
    expect(
      trackerProfileInput.safeParse({
        ...testProfile,
        minimumAge: 20,
        maximumAge: 5,
      }).success,
    ).toBe(false);
    expect(
      trackerProfileInput.safeParse({ ...testProfile, tenantId: "injected" })
        .success,
    ).toBe(false);
  });
  it("requires an N/A reason and real dates without accepting caller scope", () => {
    const input = {
      requirementId: "duty",
      requirementVersion: 1,
      profileVersion: 1,
      expectedRevision: 0,
      status: "NOT_APPLICABLE",
      notes: "",
      notApplicableReason: null,
      reviewDueAt: null,
    };
    expect(trackerAttestationInput.safeParse(input).success).toBe(false);
    expect(
      trackerAttestationInput.safeParse({
        ...input,
        notApplicableReason: "Valid exception",
      }).success,
    ).toBe(true);
    expect(
      trackerAttestationInput.safeParse({
        ...input,
        status: "COMPLETE",
        reviewDueAt: "2026-02-30",
      }).success,
    ).toBe(false);
    expect(
      trackerAttestationInput.safeParse({
        ...input,
        status: "COMPLETE",
        orgId: "injected",
      }).success,
    ).toBe(false);
    expect(
      trackerEvidenceInput.safeParse({
        requirementId: "duty",
        requirementVersion: 1,
        title: "Title",
        notes: "",
        pdf: { fileName: "../private.pdf", base64: "JVBERi0=" },
      }).success,
    ).toBe(false);
  });
});
