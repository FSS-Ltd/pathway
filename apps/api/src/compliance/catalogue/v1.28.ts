import { catalogueV127 } from "./v1.27";
import type { TrackerCatalogue } from "./schema";
import {
  romaniaCoverage,
  romaniaRequirements,
  romaniaSources,
} from "./romania";

const romaniaCells = new Map<string, TrackerCatalogue["coverage"][number]>(
  romaniaCoverage.map((cell) => [
    `${cell.jurisdiction}:${cell.sector}:${cell.topic}`,
    cell,
  ]),
);

export const catalogueV128 = {
  ...catalogueV127,
  version: "1.28.0",
  releasedAt: "2026-10-20",
  sources: [...catalogueV127.sources, ...romaniaSources],
  requirements: [...catalogueV127.requirements, ...romaniaRequirements],
  coverage: [
    ...catalogueV127.coverage.map((cell) =>
      cell.jurisdiction === "RO"
        ? (romaniaCells.get(
            `${cell.jurisdiction}:${cell.sector}:${cell.topic}`,
          ) ?? cell)
        : cell,
    ),
    ...romaniaCoverage.filter((cell) => cell.jurisdiction !== "RO"),
  ],
};
