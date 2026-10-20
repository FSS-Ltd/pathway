import { catalogueV115 } from "./v1.15";
import { franceCoverage, franceRequirements, franceSources } from "./france";

const franceCells = new Map(
  franceCoverage.map((cell) => [`${cell.sector}:${cell.topic}`, cell]),
);

export const catalogueV116 = {
  ...catalogueV115,
  version: "1.16.0",
  releasedAt: "2026-10-19",
  sources: [...catalogueV115.sources, ...franceSources],
  requirements: [...catalogueV115.requirements, ...franceRequirements],
  coverage: catalogueV115.coverage.map((cell) =>
    cell.jurisdiction === "FR"
      ? (franceCells.get(`${cell.sector}:${cell.topic}`) ?? cell)
      : cell,
  ),
};
