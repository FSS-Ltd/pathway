import { catalogueV126 } from "./v1.26";
import type { TrackerCatalogue } from "./schema";
import {
  portugalCoverage,
  portugalRequirements,
  portugalSources,
} from "./portugal";

const portugalCells = new Map<string, TrackerCatalogue["coverage"][number]>(
  portugalCoverage.map((cell) => [
    `${cell.jurisdiction}:${cell.sector}:${cell.topic}`,
    cell,
  ]),
);

export const catalogueV127 = {
  ...catalogueV126,
  version: "1.27.0",
  releasedAt: "2026-10-20",
  sources: [...catalogueV126.sources, ...portugalSources],
  requirements: [...catalogueV126.requirements, ...portugalRequirements],
  coverage: [
    ...catalogueV126.coverage.map((cell) =>
      cell.jurisdiction === "PT"
        ? (portugalCells.get(
            `${cell.jurisdiction}:${cell.sector}:${cell.topic}`,
          ) ?? cell)
        : cell,
    ),
    ...portugalCoverage.filter((cell) => cell.jurisdiction !== "PT"),
  ],
};
