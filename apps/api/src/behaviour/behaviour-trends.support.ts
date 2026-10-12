import type { BehaviourTrendsQuery } from "./dto/behaviour-entry.dto";

export interface BehaviourTrendCounts {
  totalCount: number;
  meritCount: number;
  demeritCount: number;
  generalCount: number;
  meritPoints: number;
  demeritPoints: number;
  netPoints: number;
}

export interface BehaviourTrendBucket extends BehaviourTrendCounts {
  bucketStart: string;
}

const emptyCounts = (): BehaviourTrendCounts => ({
  totalCount: 0,
  meritCount: 0,
  demeritCount: 0,
  generalCount: 0,
  meritPoints: 0,
  demeritPoints: 0,
  netPoints: 0,
});

export function fillBehaviourTrendBuckets(
  query: BehaviourTrendsQuery,
  rows: BehaviourTrendBucket[],
): { items: BehaviourTrendBucket[]; totals: BehaviourTrendCounts } {
  const byStart = new Map(rows.map((row) => [row.bucketStart, row]));
  const items: BehaviourTrendBucket[] = [];
  for (
    let start = bucketStart(query.from, query.bucket);
    start <= query.to;
    start = nextBucket(start, query.bucket)
  ) {
    items.push(byStart.get(start) ?? { bucketStart: start, ...emptyCounts() });
  }
  const totals = items.reduce<BehaviourTrendCounts>(
    (result, item) => ({
      totalCount: result.totalCount + item.totalCount,
      meritCount: result.meritCount + item.meritCount,
      demeritCount: result.demeritCount + item.demeritCount,
      generalCount: result.generalCount + item.generalCount,
      meritPoints: result.meritPoints + item.meritPoints,
      demeritPoints: result.demeritPoints + item.demeritPoints,
      netPoints: result.netPoints + item.netPoints,
    }),
    emptyCounts(),
  );
  return { items, totals };
}

function bucketStart(
  date: string,
  bucket: BehaviourTrendsQuery["bucket"],
): string {
  if (bucket === "daily") return date;
  if (bucket === "monthly") return `${date.slice(0, 7)}-01`;
  const instant = new Date(`${date}T00:00:00.000Z`);
  const daysSinceMonday = (instant.getUTCDay() + 6) % 7;
  instant.setUTCDate(instant.getUTCDate() - daysSinceMonday);
  return instant.toISOString().slice(0, 10);
}

function nextBucket(
  start: string,
  bucket: BehaviourTrendsQuery["bucket"],
): string {
  const instant = new Date(`${start}T00:00:00.000Z`);
  if (bucket === "monthly") {
    instant.setUTCMonth(instant.getUTCMonth() + 1);
  } else {
    instant.setUTCDate(instant.getUTCDate() + (bucket === "weekly" ? 7 : 1));
  }
  return instant.toISOString().slice(0, 10);
}
