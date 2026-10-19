import { catalogueV114 } from "./v1.14";
import {
  finlandCoverage,
  finlandRequirements,
  finlandSources,
} from "./finland";

const finlandCells = new Map(
  finlandCoverage.map((cell) => [`${cell.sector}:${cell.topic}`, cell]),
);

export const catalogueV115 = {
  ...catalogueV114,
  version: "1.15.0",
  releasedAt: "2026-10-19",
  sources: [...catalogueV114.sources, ...finlandSources],
  requirements: [...catalogueV114.requirements, ...finlandRequirements],
  coverage: catalogueV114.coverage.map((cell) =>
    cell.jurisdiction === "FI"
      ? (finlandCells.get(`${cell.sector}:${cell.topic}`) ?? cell)
      : cell,
  ),
};
