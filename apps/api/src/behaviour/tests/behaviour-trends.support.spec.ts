import { behaviourTrendsQuerySchema } from "../dto/behaviour-entry.dto";
import { fillBehaviourTrendBuckets } from "../behaviour-trends.support";

describe("behaviour trends query", () => {
  const query = {
    from: "2026-01-01",
    to: "2027-01-01",
    bucket: "daily" as const,
    visibility: "GENERAL" as const,
  };

  it("accepts 366 inclusive calendar days and rejects longer or invalid ranges", () => {
    expect(behaviourTrendsQuerySchema.safeParse(query).success).toBe(true);
    expect(
      behaviourTrendsQuerySchema.safeParse({ ...query, to: "2027-01-02" })
        .success,
    ).toBe(false);
    expect(
      behaviourTrendsQuerySchema.safeParse({ ...query, from: "2026-02-30" })
        .success,
    ).toBe(false);
    expect(
      behaviourTrendsQuerySchema.safeParse({ ...query, from: "2027-01-02" })
        .success,
    ).toBe(false);
  });

  it("fills empty weekly buckets without shifting local calendar labels", () => {
    const result = fillBehaviourTrendBuckets(
      {
        from: "2026-03-28",
        to: "2026-04-06",
        bucket: "weekly",
        visibility: "GENERAL",
      },
      [
        {
          bucketStart: "2026-03-30",
          totalCount: 1,
          meritCount: 1,
          demeritCount: 0,
          generalCount: 0,
          meritPoints: 2,
          demeritPoints: 0,
          netPoints: 2,
        },
      ],
    );
    expect(result.items.map((item) => item.bucketStart)).toEqual([
      "2026-03-23",
      "2026-03-30",
      "2026-04-06",
    ]);
    expect(result.totals).toMatchObject({ totalCount: 1, netPoints: 2 });
  });
});
