import { catalogueV13 } from "./v1.3";
import {
  scotlandSources,
  scotlandRequirements,
  scotlandCoverage,
} from "./scotland";

const scottishCells = new Map(
  scotlandCoverage.map((cell) => [`${cell.sector}:${cell.topic}`, cell]),
);

export const catalogueV14 = {
  ...catalogueV13,
  version: "1.4.0",
  releasedAt: "2026-10-18",
  sources: [...catalogueV13.sources, ...scotlandSources],
  requirements: [...catalogueV13.requirements, ...scotlandRequirements],
  coverage: catalogueV13.coverage.map((cell) =>
    cell.jurisdiction === "GB-SCT"
      ? (scottishCells.get(`${cell.sector}:${cell.topic}`) ?? cell)
      : cell,
  ),
};
