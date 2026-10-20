import { catalogueV130 } from "./v1.30";
import type { TrackerCatalogue } from "./schema";
import { spainCoverage, spainRequirements, spainSources } from "./spain";

const spainCells = new Map<string, TrackerCatalogue["coverage"][number]>(
  spainCoverage.map((cell) => [
    `${cell.jurisdiction}:${cell.sector}:${cell.topic}`,
    cell,
  ]),
);

export const catalogueV131 = {
  ...catalogueV130,
  version: "1.31.0",
  releasedAt: "2026-10-20",
  sources: [...catalogueV130.sources, ...spainSources],
  requirements: [...catalogueV130.requirements, ...spainRequirements],
  coverage: [
    ...catalogueV130.coverage.map((cell) =>
      cell.jurisdiction === "ES"
        ? (spainCells.get(
            `${cell.jurisdiction}:${cell.sector}:${cell.topic}`,
          ) ?? cell)
        : cell,
    ),
    ...spainCoverage.filter((cell) => cell.jurisdiction !== "ES"),
  ],
};
