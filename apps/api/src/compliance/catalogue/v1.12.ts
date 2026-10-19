import { catalogueV111 } from "./v1.11";
import {
  czechiaCoverage,
  czechiaRequirements,
  czechiaSources,
} from "./czechia";

const czechiaCells = new Map(
  czechiaCoverage.map((cell) => [`${cell.sector}:${cell.topic}`, cell]),
);

export const catalogueV112 = {
  ...catalogueV111,
  version: "1.12.0",
  releasedAt: "2026-10-19",
  sources: [...catalogueV111.sources, ...czechiaSources],
  requirements: [...catalogueV111.requirements, ...czechiaRequirements],
  coverage: catalogueV111.coverage.map((cell) =>
    cell.jurisdiction === "CZ"
      ? (czechiaCells.get(`${cell.sector}:${cell.topic}`) ?? cell)
      : cell,
  ),
};
