import { catalogueV112 } from "./v1.12";
import {
  denmarkCoverage,
  denmarkRequirements,
  denmarkSources,
} from "./denmark";

const denmarkCells = new Map(
  denmarkCoverage.map((cell) => [`${cell.sector}:${cell.topic}`, cell]),
);

export const catalogueV113 = {
  ...catalogueV112,
  version: "1.13.0",
  releasedAt: "2026-10-19",
  sources: [...catalogueV112.sources, ...denmarkSources],
  requirements: [...catalogueV112.requirements, ...denmarkRequirements],
  coverage: catalogueV112.coverage.map((cell) =>
    cell.jurisdiction === "DK"
      ? (denmarkCells.get(`${cell.sector}:${cell.topic}`) ?? cell)
      : cell,
  ),
};
