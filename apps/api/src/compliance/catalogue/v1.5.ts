import { catalogueV14 } from "./v1.4";
import {
  northernIrelandSources,
  northernIrelandRequirements,
  northernIrelandCoverage,
} from "./northern-ireland";

const northernIrelandCells = new Map(
  northernIrelandCoverage.map((cell) => [`${cell.sector}:${cell.topic}`, cell]),
);

export const catalogueV15 = {
  ...catalogueV14,
  version: "1.5.0",
  releasedAt: "2026-10-18",
  sources: [...catalogueV14.sources, ...northernIrelandSources],
  requirements: [...catalogueV14.requirements, ...northernIrelandRequirements],
  coverage: catalogueV14.coverage.map((cell) =>
    cell.jurisdiction === "GB-NIR"
      ? (northernIrelandCells.get(`${cell.sector}:${cell.topic}`) ?? cell)
      : cell,
  ),
};
