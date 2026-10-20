import { catalogueV124 } from "./v1.24";
import {
  netherlandsCoverage,
  netherlandsRequirements,
  netherlandsSources,
} from "./netherlands";

const netherlandsCells = new Map(
  netherlandsCoverage.map((cell) => [`${cell.sector}:${cell.topic}`, cell]),
);

export const catalogueV125 = {
  ...catalogueV124,
  version: "1.25.0",
  releasedAt: "2026-10-20",
  sources: [...catalogueV124.sources, ...netherlandsSources],
  requirements: [...catalogueV124.requirements, ...netherlandsRequirements],
  coverage: catalogueV124.coverage.map((cell) =>
    cell.jurisdiction === "NL"
      ? (netherlandsCells.get(`${cell.sector}:${cell.topic}`) ?? cell)
      : cell,
  ),
};
