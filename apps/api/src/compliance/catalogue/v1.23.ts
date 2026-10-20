import { catalogueV122 } from "./v1.22";
import {
  luxembourgCoverage,
  luxembourgRequirements,
  luxembourgSources,
} from "./luxembourg";

const luxembourgCells = new Map(
  luxembourgCoverage.map((cell) => [`${cell.sector}:${cell.topic}`, cell]),
);

export const catalogueV123 = {
  ...catalogueV122,
  version: "1.23.0",
  releasedAt: "2026-10-20",
  sources: [...catalogueV122.sources, ...luxembourgSources],
  requirements: [...catalogueV122.requirements, ...luxembourgRequirements],
  coverage: catalogueV122.coverage.map((cell) =>
    cell.jurisdiction === "LU"
      ? (luxembourgCells.get(`${cell.sector}:${cell.topic}`) ?? cell)
      : cell,
  ),
};
