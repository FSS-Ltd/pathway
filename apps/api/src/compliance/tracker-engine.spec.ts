import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { TrackerProfile, TrackerAttestation } from "@pathway/types";
import { TRACKER_CATALOGUE, catalogueSchema } from "./catalogue";
import {
  buildTrackerChecklist,
  evaluateCondition,
  requirementSnapshot,
  getCurrentRequirement,
} from "./tracker-engine";
const now = new Date("2026-10-18T12:00:00Z");
const review = {
  reviewer: "Test reviewer",
  verifiedAt: "2026-10-15",
  reviewDueAt: "2027-01-01",
  revision: "test1",
};
const effective = { from: "2026-01-01", to: null };
const profile: TrackerProfile = {
  version: 1,
  updatedAt: now.toISOString(),
  profile: {
    jurisdictionId: "test-england",
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
  },
};
const location = { countryCode: "GB", subdivisionCode: "GB-ENG" };
function fixture() {
  return catalogueSchema.parse({
    schemaVersion: 1,
    version: "test",
    releasedAt: "2026-10-16",
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
        publishedDateUnknownReason: "Synthetic test fixture",
        effective: { ...effective, unknownReason: null },
        retrievedAt: "2026-10-15",
        review,
        state: "REVIEWED",
        translationProvenance: null,
      },
    ],
    requirements: [
      {
        id: "test-duty",
        version: 1,
        action: "Synthetic action",
        topic: "safeguarding",
        obligationClass: "STATUTORY_DUTY",
        jurisdiction: "GB-ENG",
        sectors: ["SCHOOL"],
        condition: {
          field: "providerCategory",
          op: "eq",
          value: "INDEPENDENT_SCHOOL",
        },
        applicabilityExplanation: "Synthetic applicability",
        unknownExplanation: "Classification unknown",
        expectedEvidence: ["Synthetic record"],
        allowsNotApplicable: true,
        notApplicablePolicy: "Document exceptional classification",
        sourceIds: ["test-source"],
        signalKeys: [],
        effective,
        review,
        state: "PUBLISHED",
        materialChangeReason: "Initial fixture",
        supersedesVersion: null,
        reviewCadenceDays: 90,
        reviewCadenceBasis: "Synthetic fixture",
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
function attest(catalogue = fixture()): TrackerAttestation {
  return {
    id: "test-attestation",
    requirementId: "test-duty",
    requirementVersion: 1,
    profileVersion: 1,
    revision: 1,
    status: "COMPLETE",
    notes: "",
    notApplicableReason: null,
    reviewDueAt: null,
    requirement: requirementSnapshot(catalogue.requirements[0]!, catalogue),
    createdAt: now.toISOString(),
    createdByUserId: "test-user",
  };
}
describe("institutional tracker catalogue and engine", () => {
  it("explains an automatic not-applicable decision using the recorded fact", () => {
    const result = buildTrackerChecklist({
      catalogue: fixture(),
      profile: {
        ...profile,
        profile: { ...profile.profile, providerCategory: "STATE_SCHOOL" },
      },
      location,
      attestations: [],
      evidenceCounts: {},
      now,
    });
    expect(result.items[0]?.applicability).toBe("NOT_APPLICABLE");
    expect(result.items[0]?.applicabilityReason).toContain(
      "Recorded provider category: state school",
    );
  });
  it("mirrors every research cell and publishes the reviewed national cores", () => {
    const lines = readFileSync(
      resolve(process.cwd(), "../../docs/NexStepsV2/compliance/coverage.csv"),
      "utf8",
    )
      .trim()
      .split("\n");
    const headers = lines[0]!.split(",");
    const expected = lines.slice(1).flatMap((line) => {
      const row = line.split(",");
      return headers
        .slice(2)
        .map((topic, i) => `${row[0]}:${row[1]}:${topic}:${row[i + 2]}`);
    });
    expect(
      TRACKER_CATALOGUE.coverage.map(
        (c) => `${c.jurisdiction}:${c.sector}:${c.topic}:${c.status}`,
      ),
    ).toEqual(expected);
    expect(expected).toHaveLength(1488);
    expect(TRACKER_CATALOGUE.requirements.length).toBeGreaterThan(0);
    expect(
      TRACKER_CATALOGUE.requirements.every((item) =>
        ["GB-ENG", "GB-WLS", "GB-SCT", "GB-NIR", "IE", "AT"].includes(
          item.jurisdiction,
        ),
      ),
    ).toBe(true);
  });
  it("exposes a reviewed partial core while retaining coverage gaps, expiry and unresolved regional scope", () => {
    const catalogue = fixture();
    catalogue.coverage[0]!.status = "PARTIALLY_PUBLISHED";
    catalogue.coverage[0]!.regionalStatus = "IN_REVIEW";
    catalogue.coverage[0]!.requiresRegion = true;
    catalogue.coverage[0]!.reason =
      "Reviewed national core; local safeguards and specialist duties remain unreviewed.";
    const result = buildTrackerChecklist({
      catalogue,
      profile,
      location,
      attestations: [attest(catalogue)],
      evidenceCounts: {},
      now,
    });
    expect(result.items).toHaveLength(1);
    expect(result.progress.completed).toBe(1);
    expect(result.progress.applicable).toBe(1);
    expect(
      result.coverage.find((cell) => cell.topic === "safeguarding")!.status,
    ).toBe("PARTIALLY_PUBLISHED");
    expect(
      result.coverage.find((cell) => cell.topic === "safeguarding")!
        .regionalStatus,
    ).toBe("UNAVAILABLE");
    expect(result.coverageGaps).toBe(8);
    catalogue.sources[0]!.state = "WITHDRAWN";
    const withdrawn = buildTrackerChecklist({
      catalogue,
      profile,
      location,
      attestations: [attest(catalogue)],
      evidenceCounts: {},
      now,
    });
    expect(withdrawn.items).toEqual([]);
    expect(withdrawn.progress.applicable).toBe(0);
    expect(
      withdrawn.coverage.find((cell) => cell.topic === "safeguarding")!.status,
    ).toBe("STALE");
    expect(withdrawn.coverageGaps).toBe(8);
  });
  it("preserves unknown in negation and nested groups", () => {
    expect(
      evaluateCondition(
        { not: { field: "icce", op: "eq", value: true } },
        profile.profile,
        location,
      ),
    ).toBe("UNRESOLVED");
    expect(
      evaluateCondition(
        {
          all: [
            { field: "ace", op: "eq", value: false },
            { field: "icce", op: "eq", value: true },
          ],
        },
        profile.profile,
        location,
      ),
    ).toBe("NOT_APPLICABLE");
    expect(
      evaluateCondition(
        {
          any: [
            { field: "ace", op: "eq", value: true },
            { field: "icce", op: "eq", value: true },
          ],
        },
        profile.profile,
        location,
      ),
    ).toBe("APPLICABLE");
  });
  it("counts manual completion independently of evidence gaps", () => {
    const catalogue = fixture();
    const result = buildTrackerChecklist({
      catalogue,
      profile,
      location,
      attestations: [attest()],
      evidenceCounts: {},
      now,
    });
    expect(result.progress).toMatchObject({
      completed: 1,
      applicable: 1,
      evidenceGaps: 1,
    });
    expect(result.coverageGaps).toBe(7);
  });
  it("requires renewed confirmation after profile/version changes and overdue review", () => {
    const catalogue = fixture();
    for (const changed of [
      { ...attest(), profileVersion: 0 },
      { ...attest(), requirementVersion: 0 },
      { ...attest(), reviewDueAt: "2026-10-15" },
    ])
      expect(
        buildTrackerChecklist({
          catalogue,
          profile,
          location,
          attestations: [changed],
          evidenceCounts: {},
          now,
        }).progress.completed,
      ).toBe(0);
  });
  it("only excludes permitted justified current N/A from denominator", () => {
    const catalogue = fixture();
    const a = {
      ...attest(),
      status: "NOT_APPLICABLE" as const,
      notApplicableReason: "Recorded exception",
    };
    expect(
      buildTrackerChecklist({
        catalogue,
        profile,
        location,
        attestations: [a],
        evidenceCounts: {},
        now,
      }).progress,
    ).toMatchObject({ applicable: 0, notApplicable: 1 });
    expect(
      buildTrackerChecklist({
        catalogue,
        profile,
        location,
        attestations: [{ ...a, notApplicableReason: " " }],
        evidenceCounts: {},
        now,
      }).progress.applicable,
    ).toBe(1);
  });
  it("does not infer England, public funding or ICCE from screen selection", () => {
    const catalogue = fixture();
    expect(
      buildTrackerChecklist({
        catalogue,
        profile,
        location: { countryCode: "GB", subdivisionCode: null },
        attestations: [],
        evidenceCounts: {},
        now,
      }).items,
    ).toEqual([]);
    expect(
      evaluateCondition(
        { field: "icce", op: "eq", value: true },
        profile.profile,
        location,
      ),
    ).toBe("UNRESOLVED");
    expect(
      evaluateCondition(
        { field: "fundingStatus", op: "eq", value: "PUBLIC" },
        {
          ...profile.profile,
          vertical: "PUBLIC_LEARNING_CENTRE",
          fundingStatus: null,
        },
        location,
      ),
    ).toBe("UNRESOLVED");
  });
  it("withdrawal and review expiry expose gaps and stop current confirmations", () => {
    const catalogue = fixture();
    catalogue.requirements[0]!.state = "WITHDRAWN";
    expect(getCurrentRequirement(catalogue, "test-duty", 1, now)).toBeNull();
    const result = buildTrackerChecklist({
      catalogue,
      profile,
      location,
      attestations: [attest()],
      evidenceCounts: {},
      now,
    });
    expect(result.items).toEqual([]);
    expect(
      result.coverage.find((c) => c.topic === "safeguarding")?.status,
    ).toBe("STALE");
  });
  it("rejects duplicate versions, invalid dates, dangling sources and unconditional N/A", () => {
    const catalogue = fixture();
    expect(
      catalogueSchema.safeParse({
        ...catalogue,
        requirements: [...catalogue.requirements, ...catalogue.requirements],
      }).success,
    ).toBe(false);
    expect(
      catalogueSchema.safeParse({ ...catalogue, releasedAt: "2026-02-30" })
        .success,
    ).toBe(false);
    expect(
      catalogueSchema.safeParse({ ...catalogue, sources: [] }).success,
    ).toBe(false);
    expect(
      catalogueSchema.safeParse({
        ...catalogue,
        requirements: [{ ...catalogue.requirements[0], condition: null }],
      }).success,
    ).toBe(false);
  });
  it("excludes expired sources and superseded revisions", () => {
    const catalogue = fixture();
    catalogue.requirements.push({
      ...catalogue.requirements[0]!,
      version: 2,
      supersedesVersion: 1,
    });
    expect(getCurrentRequirement(catalogue, "test-duty", 1, now)).toBeNull();
    catalogue.sources[0]!.review.reviewDueAt = "2026-10-15";
    expect(getCurrentRequirement(catalogue, "test-duty", 2, now)).toBeNull();
  });
  it("keeps current actions visible when another action in the topic expires", () => {
    const catalogue = fixture();
    catalogue.requirements.push({
      ...catalogue.requirements[0]!,
      id: "expired-action",
      review: { ...review, reviewDueAt: "2026-10-15" },
    });
    const result = buildTrackerChecklist({
      catalogue,
      profile,
      location,
      attestations: [],
      evidenceCounts: {},
      now,
    });
    expect(result.items.map((item) => item.requirement.id)).toEqual([
      "test-duty",
    ]);
    expect(
      result.coverage.find((cell) => cell.topic === "safeguarding")?.status,
    ).toBe("STALE");
  });
  it("marks reviewed-empty coverage stale when its source expires", () => {
    const catalogue = fixture();
    catalogue.requirements = [];
    catalogue.coverage[0]!.status = "REVIEWED_NO_REQUIREMENTS";
    catalogue.sources[0]!.review.reviewDueAt = "2026-10-15";
    expect(
      buildTrackerChecklist({
        catalogue,
        profile,
        location,
        attestations: [],
        evidenceCounts: {},
        now,
      }).coverageGaps,
    ).toBe(8);
  });
  it("keeps regional gaps and nursery scope distinct", () => {
    const catalogue = fixture();
    catalogue.coverage[0]!.requiresRegion = true;
    catalogue.coverage[0]!.regions = ["Test region"];
    expect(
      buildTrackerChecklist({
        catalogue,
        profile,
        location,
        attestations: [],
        evidenceCounts: {},
        now,
      }).coverage[1]!.regionalStatus,
    ).toBe("UNAVAILABLE");
    const result = buildTrackerChecklist({
      catalogue: TRACKER_CATALOGUE,
      profile: {
        ...profile,
        profile: { ...profile.profile, vertical: "NURSERY" },
      },
      location,
      attestations: [],
      evidenceCounts: {},
      now,
    });
    expect(result.coverage.every((cell) => cell.sector === "NURSERY")).toBe(
      true,
    );
    expect(result.progress.applicable).toBeGreaterThan(0);
    expect(
      result.items.some(
        (item) =>
          item.requirement.id === "eng.independent-registration" &&
          item.applicability === "APPLICABLE",
      ),
    ).toBe(true);
    expect(result.coverageGaps).toBe(8);
  });
  it("counts unknown activity separately and evaluates age boundaries", () => {
    const catalogue = fixture();
    catalogue.requirements[0]!.condition = {
      field: "childcare",
      op: "eq",
      value: true,
    };
    expect(
      buildTrackerChecklist({
        catalogue,
        profile,
        location,
        attestations: [],
        evidenceCounts: {},
        now,
      }).progress,
    ).toMatchObject({ applicable: 0, unresolved: 1 });
    expect(
      evaluateCondition(
        { field: "minimumAge", op: "gte", value: 5 },
        profile.profile,
        location,
      ),
    ).toBe("APPLICABLE");
    expect(
      evaluateCondition(
        { field: "maximumAge", op: "lte", value: 17 },
        profile.profile,
        location,
      ),
    ).toBe("NOT_APPLICABLE");
  });
  it("rejects type-invalid conditions and absent superseded versions", () => {
    const catalogue = fixture();
    for (const condition of [
      { field: "ace", op: "eq", value: "yes" },
      { field: "providerCategory", op: "eq", value: "ACE_SCHOOL" },
    ])
      expect(
        catalogueSchema.safeParse({
          ...catalogue,
          requirements: [{ ...catalogue.requirements[0], condition }],
        }).success,
      ).toBe(false);
    expect(
      catalogueSchema.safeParse({
        ...catalogue,
        requirements: [
          { ...catalogue.requirements[0], version: 3, supersedesVersion: 2 },
        ],
      }).success,
    ).toBe(false);
  });
  it("reports separate national and selected EU subdivision gaps", () => {
    const result = buildTrackerChecklist({
      catalogue: TRACKER_CATALOGUE,
      profile,
      location: { countryCode: "DE", subdivisionCode: "DE-BE" },
      attestations: [],
      evidenceCounts: {},
      now,
    });
    expect(result.coverage).toHaveLength(16);
    expect(
      result.coverage
        .filter((cell) => cell.jurisdiction === "DE-BE")
        .every((cell) => cell.status === "UNAVAILABLE"),
    ).toBe(true);
    expect(result.coverageGaps).toBe(16);
  });
  it("retains withdrawn source history but never republishes it", () => {
    const catalogue = fixture();
    catalogue.sources[0]!.state = "WITHDRAWN";
    catalogue.requirements[0]!.state = "WITHDRAWN";
    catalogue.coverage[0]!.status = "WITHDRAWN";
    expect(catalogueSchema.safeParse(catalogue).success).toBe(true);
    expect(
      buildTrackerChecklist({
        catalogue,
        profile,
        location,
        attestations: [],
        evidenceCounts: {},
        now,
      }).items,
    ).toEqual([]);
    catalogue.requirements[0]!.state = "PUBLISHED";
    expect(catalogueSchema.safeParse(catalogue).success).toBe(false);
  });
  it("preserves unknown source commencement without inventing active duties", () => {
    const catalogue = fixture();
    catalogue.sources[0]!.effective = {
      from: null,
      to: null,
      unknownReason: "Commencement not yet verified",
    };
    expect(catalogueSchema.safeParse(catalogue).success).toBe(true);
    expect(getCurrentRequirement(catalogue, "test-duty", 1, now)).toBeNull();
    expect(
      buildTrackerChecklist({
        catalogue,
        profile,
        location,
        attestations: [],
        evidenceCounts: {},
        now,
      }).items,
    ).toEqual([]);
  });
  it("does not use active requirements under coverage whose separate source expired", () => {
    const catalogue = fixture();
    catalogue.sources.push({
      ...catalogue.sources[0]!,
      id: "coverage-source",
      review: { ...review, reviewDueAt: "2026-10-15" },
    });
    catalogue.coverage[0]!.sourceIds = ["coverage-source"];
    expect(
      getCurrentRequirement(catalogue, "test-duty", 1, now),
    ).not.toBeNull();
    expect(
      buildTrackerChecklist({
        catalogue,
        profile,
        location,
        attestations: [],
        evidenceCounts: {},
        now,
      }).items,
    ).toEqual([]);
  });
  it("includes requirements for exact validated ancestor regions", () => {
    const catalogue = fixture();
    catalogue.sources[0]!.territory.push("DE", "DE-BY");
    catalogue.requirements[0]!.jurisdiction = "DE-BY";
    catalogue.coverage[0]!.jurisdiction = "DE-BY";
    const result = buildTrackerChecklist({
      catalogue,
      profile,
      location: {
        countryCode: "DE",
        subdivisionCode: "DE-BY",
        jurisdictionCodes: ["DE", "DE-BY"],
      },
      attestations: [],
      evidenceCounts: {},
      now,
    });
    expect(result.items).toHaveLength(1);
    expect(
      result.coverage.filter((cell) => cell.jurisdiction === "DE"),
    ).toHaveLength(8);
  });
});
