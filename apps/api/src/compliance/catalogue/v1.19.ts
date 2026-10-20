import { catalogueV118 } from "./v1.18";
import {
  hungaryCoverage,
  hungaryRequirements,
  hungarySources,
} from "./hungary";

const hungaryCells = new Map(
  hungaryCoverage.map((cell) => [`${cell.sector}:${cell.topic}`, cell]),
);

export const catalogueV119 = {
  ...catalogueV118,
  version: "1.19.0",
  releasedAt: "2026-10-20",
  sources: [...catalogueV118.sources, ...hungarySources],
  requirements: [...catalogueV118.requirements, ...hungaryRequirements],
  coverage: catalogueV118.coverage.map((cell) =>
    cell.jurisdiction === "HU"
      ? (hungaryCells.get(`${cell.sector}:${cell.topic}`) ?? cell)
      : cell,
  ),
};
