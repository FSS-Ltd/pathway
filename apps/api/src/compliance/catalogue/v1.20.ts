import { catalogueV119 } from "./v1.19";
import { italyCoverage, italyRequirements, italySources } from "./italy";

const italyCells = new Map(
  italyCoverage.map((cell) => [`${cell.sector}:${cell.topic}`, cell]),
);

export const catalogueV120 = {
  ...catalogueV119,
  version: "1.20.0",
  releasedAt: "2026-10-20",
  sources: [...catalogueV119.sources, ...italySources],
  requirements: [...catalogueV119.requirements, ...italyRequirements],
  coverage: catalogueV119.coverage.map((cell) =>
    cell.jurisdiction === "IT"
      ? (italyCells.get(`${cell.sector}:${cell.topic}`) ?? cell)
      : cell,
  ),
};
