import { catalogueV15 } from "./v1.5";
import {
  irelandSources,
  irelandRequirements,
  irelandCoverage,
} from "./ireland";

const irelandCells = new Map(
  irelandCoverage.map((cell) => [`${cell.sector}:${cell.topic}`, cell]),
);

export const catalogueV16 = {
  ...catalogueV15,
  version: "1.6.0",
  releasedAt: "2026-10-18",
  sources: [...catalogueV15.sources, ...irelandSources],
  requirements: [...catalogueV15.requirements, ...irelandRequirements],
  coverage: catalogueV15.coverage.map((cell) =>
    cell.jurisdiction === "IE"
      ? (irelandCells.get(`${cell.sector}:${cell.topic}`) ?? cell)
      : cell,
  ),
};
