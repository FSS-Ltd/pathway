import { catalogueV12 } from "./v1.2";
import { walesSources, walesRequirements, walesCoverage } from "./wales";

const welshCells = new Map(
  walesCoverage.map((cell) => [`${cell.sector}:${cell.topic}`, cell]),
);

export const catalogueV13 = {
  ...catalogueV12,
  version: "1.3.0",
  releasedAt: "2026-10-17",
  sources: [...catalogueV12.sources, ...walesSources],
  requirements: [...catalogueV12.requirements, ...walesRequirements],
  coverage: catalogueV12.coverage.map((cell) =>
    cell.jurisdiction === "GB-WLS"
      ? (welshCells.get(`${cell.sector}:${cell.topic}`) ?? cell)
      : cell,
  ),
};
