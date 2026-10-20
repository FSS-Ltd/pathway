import { catalogueV121 } from "./v1.21";
import {
  lithuaniaCoverage,
  lithuaniaRequirements,
  lithuaniaSources,
} from "./lithuania";

const lithuaniaCells = new Map(
  lithuaniaCoverage.map((cell) => [`${cell.sector}:${cell.topic}`, cell]),
);

export const catalogueV122 = {
  ...catalogueV121,
  version: "1.22.0",
  releasedAt: "2026-10-20",
  sources: [...catalogueV121.sources, ...lithuaniaSources],
  requirements: [...catalogueV121.requirements, ...lithuaniaRequirements],
  coverage: catalogueV121.coverage.map((cell) =>
    cell.jurisdiction === "LT"
      ? (lithuaniaCells.get(`${cell.sector}:${cell.topic}`) ?? cell)
      : cell,
  ),
};
