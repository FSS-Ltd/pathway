import { catalogueV131 } from "./v1.31";
import type { TrackerCatalogue } from "./schema";
import { swedenCoverage, swedenRequirements, swedenSources } from "./sweden";

const swedenCells = new Map<string, TrackerCatalogue["coverage"][number]>(
  swedenCoverage.map((cell) => [
    `${cell.jurisdiction}:${cell.sector}:${cell.topic}`,
    cell,
  ]),
);

export const catalogueV132 = {
  ...catalogueV131,
  version: "1.32.0",
  releasedAt: "2026-10-20",
  sources: [...catalogueV131.sources, ...swedenSources],
  requirements: [...catalogueV131.requirements, ...swedenRequirements],
  coverage: [
    ...catalogueV131.coverage.map((cell) =>
      cell.jurisdiction === "SE"
        ? (swedenCells.get(
            `${cell.jurisdiction}:${cell.sector}:${cell.topic}`,
          ) ?? cell)
        : cell,
    ),
    ...swedenCoverage.filter((cell) => cell.jurisdiction !== "SE"),
  ],
};
