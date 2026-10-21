import { belgiumRegionCoverage } from "./belgium/region-coverage";
import { catalogueV137 } from "./v1.37";

export const catalogueV138 = {
  ...catalogueV137,
  version: "1.38.0",
  releasedAt: "2026-10-21",
  coverage: [...catalogueV137.coverage, ...belgiumRegionCoverage],
};
