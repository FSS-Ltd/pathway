import { catalogueV117 } from "./v1.17";
import { greeceCoverage, greeceRequirements, greeceSources } from "./greece";

const greeceCells = new Map(
  greeceCoverage.map((cell) => [`${cell.sector}:${cell.topic}`, cell]),
);

export const catalogueV118 = {
  ...catalogueV117,
  version: "1.18.0",
  releasedAt: "2026-10-20",
  sources: [...catalogueV117.sources, ...greeceSources],
  requirements: [...catalogueV117.requirements, ...greeceRequirements],
  coverage: catalogueV117.coverage.map((cell) =>
    cell.jurisdiction === "GR"
      ? (greeceCells.get(`${cell.sector}:${cell.topic}`) ?? cell)
      : cell,
  ),
};
