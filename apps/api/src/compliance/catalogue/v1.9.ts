import { catalogueV18 } from "./v1.8";
import {
  bulgariaSources,
  bulgariaRequirements,
  bulgariaCoverage,
} from "./bulgaria";

const bulgariaCells = new Map(
  bulgariaCoverage.map((cell) => [`${cell.sector}:${cell.topic}`, cell]),
);

export const catalogueV19 = {
  ...catalogueV18,
  version: "1.9.0",
  releasedAt: "2026-10-18",
  sources: [...catalogueV18.sources, ...bulgariaSources],
  requirements: [...catalogueV18.requirements, ...bulgariaRequirements],
  coverage: catalogueV18.coverage.map((cell) =>
    cell.jurisdiction === "BG"
      ? (bulgariaCells.get(`${cell.sector}:${cell.topic}`) ?? cell)
      : cell,
  ),
};
