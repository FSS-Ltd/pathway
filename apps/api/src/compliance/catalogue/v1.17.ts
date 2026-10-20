import { catalogueV116 } from "./v1.16";
import {
  germanyCoverage,
  germanyRequirements,
  germanySources,
} from "./germany";

const germanyCells = new Map(
  germanyCoverage.map((cell) => [`${cell.sector}:${cell.topic}`, cell]),
);

export const catalogueV117 = {
  ...catalogueV116,
  version: "1.17.0",
  releasedAt: "2026-10-20",
  sources: [...catalogueV116.sources, ...germanySources],
  requirements: [...catalogueV116.requirements, ...germanyRequirements],
  coverage: catalogueV116.coverage.map((cell) =>
    cell.jurisdiction === "DE"
      ? (germanyCells.get(`${cell.sector}:${cell.topic}`) ?? cell)
      : cell,
  ),
};
