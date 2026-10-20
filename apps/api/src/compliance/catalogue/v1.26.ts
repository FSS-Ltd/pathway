import { catalogueV125 } from "./v1.25";
import { polandCoverage, polandRequirements, polandSources } from "./poland";

const polandCells = new Map(
  polandCoverage.map((cell) => [`${cell.sector}:${cell.topic}`, cell]),
);

export const catalogueV126 = {
  ...catalogueV125,
  version: "1.26.0",
  releasedAt: "2026-10-20",
  sources: [...catalogueV125.sources, ...polandSources],
  requirements: [...catalogueV125.requirements, ...polandRequirements],
  coverage: catalogueV125.coverage.map((cell) =>
    cell.jurisdiction === "PL"
      ? (polandCells.get(`${cell.sector}:${cell.topic}`) ?? cell)
      : cell,
  ),
};
