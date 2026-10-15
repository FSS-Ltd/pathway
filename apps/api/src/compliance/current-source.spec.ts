import { currentSource } from "./catalogue/current";
import { catalogueSchema, type TrackerCatalogue } from "./catalogue/schema";

type Source = TrackerCatalogue["sources"][number];
const today = "2026-10-15";
function source(): Source {
  return {
    id: "reviewed-guidance",
    url: "https://www.gov.uk/example",
    title: "Current guidance",
    authority: "Government",
    provision: "Current edition",
    territory: ["GB-ENG"],
    language: "en",
    classification: "GUIDANCE",
    publishedAt: null,
    publishedDateUnknownReason: "Undated guidance",
    effective: { from: null, to: null, unknownReason: "Commencement unknown" },
    retrievedAt: today,
    review: {
      reviewer: "Source reviewer",
      verifiedAt: today,
      reviewDueAt: "2027-01-12",
      revision: "1",
    },
    state: "REVIEWED",
    translationProvenance: null,
  };
}
function parse(value: Source) {
  return catalogueSchema.safeParse({
    schemaVersion: 1,
    version: "test",
    releasedAt: today,
    sources: [value],
    requirements: [],
    coverage: [],
  });
}

describe("current source applicability observation", () => {
  it("does not infer applicability from reviewed state alone", () => {
    expect(currentSource(source(), today)).toBe(false);
    expect(parse(source()).success).toBe(true);
  });
  it("accepts an explicit reviewed current observation without inventing commencement", () => {
    const value = source();
    value.effective.currentAsOf = today;
    expect(parse(value).success).toBe(true);
    expect(currentSource(value, today)).toBe(true);
    expect(value.effective.from).toBeNull();
  });
  it.each(["future", "stale", "withdrawn", "ended"])(
    "rejects %s sources",
    (kind) => {
      const value = source();
      value.effective.currentAsOf = today;
      if (kind === "future") value.effective.currentAsOf = "2026-10-16";
      if (kind === "stale") value.review.reviewDueAt = "2026-10-14";
      if (kind === "withdrawn") value.state = "WITHDRAWN";
      if (kind === "ended") value.effective.to = "2026-10-14";
      expect(currentSource(value, today)).toBe(false);
    },
  );
  it("uses a known future start instead of the current observation", () => {
    const value = source();
    value.effective.from = "2026-11-01";
    value.effective.currentAsOf = today;
    expect(currentSource(value, today)).toBe(false);
  });
  it.each(["retrievedAt", "verifiedAt", "reviewDueAt"])(
    "rejects observations beyond %s",
    (field) => {
      const value = source();
      value.effective.currentAsOf = today;
      if (field === "retrievedAt") value.retrievedAt = "2026-10-14";
      if (field === "verifiedAt") value.review.verifiedAt = "2026-10-14";
      if (field === "reviewDueAt") value.review.reviewDueAt = "2026-10-14";
      expect(parse(value).success).toBe(false);
    },
  );
  it("still requires an explanation for unknown commencement", () => {
    const value = source();
    value.effective.currentAsOf = today;
    value.effective.unknownReason = null;
    expect(parse(value).success).toBe(false);
  });
});
