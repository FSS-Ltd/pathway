import type { TrackerCatalogue } from "./schema";
export function currentSource(
  source: TrackerCatalogue["sources"][number] | undefined,
  today: string,
): boolean {
  return (
    source?.state === "REVIEWED" &&
    source.review.verifiedAt <= today &&
    source.review.reviewDueAt >= today &&
    (source.effective.from !== null
      ? source.effective.from <= today
      : Boolean(
          source.effective.currentAsOf &&
          source.effective.currentAsOf <= today &&
          source.effective.currentAsOf <= source.review.verifiedAt &&
          source.effective.currentAsOf <= source.retrievedAt,
        )) &&
    (!source.effective.to || source.effective.to >= today)
  );
}
