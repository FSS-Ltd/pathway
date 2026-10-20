import { catalogueV128 } from "./v1.28";
import type { TrackerCatalogue } from "./schema";
import {
  slovakiaCoverage,
  slovakiaRequirements,
  slovakiaSources,
} from "./slovakia";

const slovakiaCells = new Map<string, TrackerCatalogue["coverage"][number]>(
  slovakiaCoverage.map((cell) => [
    `${cell.jurisdiction}:${cell.sector}:${cell.topic}`,
    cell,
  ]),
);

export const catalogueV129 = {
  ...catalogueV128,
  version: "1.29.0",
  releasedAt: "2026-10-20",
  sources: [...catalogueV128.sources, ...slovakiaSources],
  requirements: [...catalogueV128.requirements, ...slovakiaRequirements],
  coverage: [
    ...catalogueV128.coverage.map((cell) =>
      cell.jurisdiction === "SK"
        ? (slovakiaCells.get(
            `${cell.jurisdiction}:${cell.sector}:${cell.topic}`,
          ) ?? cell)
        : cell,
    ),
    ...slovakiaCoverage.filter((cell) => cell.jurisdiction !== "SK"),
  ],
};
