import { catalogueV17 } from "./v1.7";
import {
  belgiumSources,
  belgiumRequirements,
  belgiumCoverage,
} from "./belgium";

const belgiumCells = new Map(
  belgiumCoverage.map((cell) => [`${cell.sector}:${cell.topic}`, cell]),
);

export const catalogueV18 = {
  ...catalogueV17,
  version: "1.8.0",
  releasedAt: "2026-10-18",
  sources: [...catalogueV17.sources, ...belgiumSources],
  requirements: [...catalogueV17.requirements, ...belgiumRequirements],
  coverage: catalogueV17.coverage.map((cell) =>
    cell.jurisdiction === "BE"
      ? (belgiumCells.get(`${cell.sector}:${cell.topic}`) ?? cell)
      : cell,
  ),
};
