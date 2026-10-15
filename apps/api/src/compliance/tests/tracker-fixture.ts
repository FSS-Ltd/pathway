import { catalogueSchema } from "../catalogue";
import type { TrackerProfileInput } from "@pathway/types";
export const testProfile: TrackerProfileInput = {
  jurisdictionId: "a0000000-0000-4000-8000-000000000002",
  region: null,
  localAuthority: null,
  sector: "SCHOOL",
  vertical: "ACE_SCHOOL",
  providerCategory: "INDEPENDENT_SCHOOL",
  fundingStatus: "PRIVATE",
  minimumAge: 5,
  maximumAge: 18,
  provisionPattern: "FULL_TIME",
  childcare: null,
  charitable: null,
  food: null,
  transport: null,
  trips: null,
  boarding: null,
  ace: true,
  icce: null,
};
export function trackerFixture() {
  const today = new Date().toISOString().slice(0, 10);
  const review = {
    reviewer: "Synthetic test reviewer",
    verifiedAt: today,
    reviewDueAt: new Date(Date.now() + 30 * 86400000)
      .toISOString()
      .slice(0, 10),
    revision: "fixture",
  };
  const effective = { from: today, to: null };
  const requirement = {
    id: "test-duty",
    version: 1,
    action: "Synthetic review action",
    topic: "safeguarding",
    obligationClass: "STATUTORY_DUTY",
    jurisdiction: "GB-ENG",
    sectors: ["SCHOOL"],
    condition: {
      field: "providerCategory",
      op: "eq",
      value: "INDEPENDENT_SCHOOL",
    },
    applicabilityExplanation: "Synthetic condition",
    unknownExplanation: "Classify provider",
    expectedEvidence: ["Record"],
    allowsNotApplicable: true,
    notApplicablePolicy: "Permitted synthetic exception",
    sourceIds: ["test-source"],
    signalKeys: [],
    effective,
    review,
    state: "PUBLISHED",
    materialChangeReason: "Initial fixture",
    supersedesVersion: null,
    reviewCadenceDays: 90,
    reviewCadenceBasis: "Test fixture",
  };
  return catalogueSchema.parse({
    schemaVersion: 1,
    version: "test",
    releasedAt: today,
    sources: [
      {
        id: "test-source",
        url: "https://example.test/source",
        title: "Synthetic source",
        authority: "Test authority",
        provision: "Test paragraph",
        territory: ["GB-ENG"],
        language: "en",
        classification: "GUIDANCE",
        publishedAt: null,
        publishedDateUnknownReason: "Test",
        effective: { ...effective, unknownReason: null },
        retrievedAt: today,
        review,
        state: "REVIEWED",
        translationProvenance: null,
      },
    ],
    requirements: [
      requirement,
      {
        ...requirement,
        id: "unconditional-duty",
        condition: null,
        allowsNotApplicable: false,
        notApplicablePolicy: null,
      },
    ],
    coverage: [
      {
        jurisdiction: "GB-ENG",
        sector: "SCHOOL",
        topic: "safeguarding",
        status: "PUBLISHED",
        regionalStatus: "REVIEWED_NO_REQUIREMENTS",
        regions: [],
        requiresRegion: false,
        reason: "Synthetic reviewed scope",
        sourceIds: ["test-source"],
        review,
      },
    ],
  });
}
