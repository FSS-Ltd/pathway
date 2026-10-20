import { catalogueV120 } from "./v1.20";
import { latviaCoverage, latviaRequirements, latviaSources } from "./latvia";

const latviaCells = new Map(
  latviaCoverage.map((cell) => [`${cell.sector}:${cell.topic}`, cell]),
);

export const catalogueV121 = {
  ...catalogueV120,
  version: "1.21.0",
  releasedAt: "2026-10-20",
  sources: [...catalogueV120.sources, ...latviaSources],
  requirements: [...catalogueV120.requirements, ...latviaRequirements],
  coverage: catalogueV120.coverage.map((cell) =>
    cell.jurisdiction === "LV"
      ? (latviaCells.get(`${cell.sector}:${cell.topic}`) ?? cell)
      : cell,
  ),
};
