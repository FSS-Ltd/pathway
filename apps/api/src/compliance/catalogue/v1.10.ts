import { catalogueV19 } from "./v1.9";
import {
  croatiaSources,
  croatiaRequirements,
  croatiaCoverage,
} from "./croatia";

const croatiaCells = new Map(
  croatiaCoverage.map((cell) => [`${cell.sector}:${cell.topic}`, cell]),
);

export const catalogueV110 = {
  ...catalogueV19,
  version: "1.10.0",
  releasedAt: "2026-10-18",
  sources: [...catalogueV19.sources, ...croatiaSources],
  requirements: [...catalogueV19.requirements, ...croatiaRequirements],
  coverage: catalogueV19.coverage.map((cell) =>
    cell.jurisdiction === "HR"
      ? (croatiaCells.get(`${cell.sector}:${cell.topic}`) ?? cell)
      : cell,
  ),
};
