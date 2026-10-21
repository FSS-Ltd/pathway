import { austriaLandCoverage } from "./austria/land-coverage";
import { catalogueV136 } from "./v1.36";

export const catalogueV137 = {
  ...catalogueV136,
  version: "1.37.0",
  releasedAt: "2026-10-21",
  coverage: [...catalogueV136.coverage, ...austriaLandCoverage],
};
