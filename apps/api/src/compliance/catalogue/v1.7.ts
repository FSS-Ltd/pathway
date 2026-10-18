import { catalogueV16 } from "./v1.6";
import {
  austriaSources,
  austriaRequirements,
  austriaCoverage,
} from "./austria";

const austriaCells = new Map(
  austriaCoverage.map((cell) => [`${cell.sector}:${cell.topic}`, cell]),
);

export const catalogueV17 = {
  ...catalogueV16,
  version: "1.7.0",
  releasedAt: "2026-10-18",
  sources: [...catalogueV16.sources, ...austriaSources],
  requirements: [...catalogueV16.requirements, ...austriaRequirements],
  coverage: catalogueV16.coverage.map((cell) =>
    cell.jurisdiction === "AT"
      ? (austriaCells.get(`${cell.sector}:${cell.topic}`) ?? cell)
      : cell,
  ),
};
