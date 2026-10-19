import { catalogueV113 } from "./v1.13";
import {
  estoniaCoverage,
  estoniaRequirements,
  estoniaSources,
} from "./estonia";

const estoniaCells = new Map(
  estoniaCoverage.map((cell) => [`${cell.sector}:${cell.topic}`, cell]),
);

export const catalogueV114 = {
  ...catalogueV113,
  version: "1.14.0",
  releasedAt: "2026-10-19",
  sources: [...catalogueV113.sources, ...estoniaSources],
  requirements: [...catalogueV113.requirements, ...estoniaRequirements],
  coverage: catalogueV113.coverage.map((cell) =>
    cell.jurisdiction === "EE"
      ? (estoniaCells.get(`${cell.sector}:${cell.topic}`) ?? cell)
      : cell,
  ),
};
