import { catalogueV123 } from "./v1.23";
import { maltaCoverage, maltaRequirements, maltaSources } from "./malta";

const maltaCells = new Map(
  maltaCoverage.map((cell) => [`${cell.sector}:${cell.topic}`, cell]),
);

export const catalogueV124 = {
  ...catalogueV123,
  version: "1.24.0",
  releasedAt: "2026-10-20",
  sources: [...catalogueV123.sources, ...maltaSources],
  requirements: [...catalogueV123.requirements, ...maltaRequirements],
  coverage: catalogueV123.coverage.map((cell) =>
    cell.jurisdiction === "MT"
      ? (maltaCells.get(`${cell.sector}:${cell.topic}`) ?? cell)
      : cell,
  ),
};
