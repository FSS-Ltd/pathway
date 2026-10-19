import { catalogueV110 } from "./v1.10";
import { cyprusCoverage, cyprusRequirements, cyprusSources } from "./cyprus";

const cyprusCells = new Map(
  cyprusCoverage.map((cell) => [`${cell.sector}:${cell.topic}`, cell]),
);

export const catalogueV111 = {
  ...catalogueV110,
  version: "1.11.0",
  releasedAt: "2026-10-19",
  sources: [...catalogueV110.sources, ...cyprusSources],
  requirements: [...catalogueV110.requirements, ...cyprusRequirements],
  coverage: catalogueV110.coverage.map((cell) =>
    cell.jurisdiction === "CY"
      ? (cyprusCells.get(`${cell.sector}:${cell.topic}`) ?? cell)
      : cell,
  ),
};
