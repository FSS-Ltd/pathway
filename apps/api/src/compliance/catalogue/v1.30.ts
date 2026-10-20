import { catalogueV129 } from "./v1.29";
import type { TrackerCatalogue } from "./schema";
import {
  sloveniaCoverage,
  sloveniaRequirements,
  sloveniaSources,
} from "./slovenia";

const sloveniaCells = new Map<string, TrackerCatalogue["coverage"][number]>(
  sloveniaCoverage.map((cell) => [
    `${cell.jurisdiction}:${cell.sector}:${cell.topic}`,
    cell,
  ]),
);

export const catalogueV130 = {
  ...catalogueV129,
  version: "1.30.0",
  releasedAt: "2026-10-20",
  sources: [...catalogueV129.sources, ...sloveniaSources],
  requirements: [...catalogueV129.requirements, ...sloveniaRequirements],
  coverage: [
    ...catalogueV129.coverage.map((cell) =>
      cell.jurisdiction === "SI"
        ? (sloveniaCells.get(
            `${cell.jurisdiction}:${cell.sector}:${cell.topic}`,
          ) ?? cell)
        : cell,
    ),
    ...sloveniaCoverage.filter((cell) => cell.jurisdiction !== "SI"),
  ],
};
