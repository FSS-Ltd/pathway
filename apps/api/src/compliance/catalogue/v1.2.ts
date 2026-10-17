import { catalogueV11 } from "./v1.1";
import {
  englandDetailSources,
  englandDetailRequirements,
  englandDetailCoverage,
} from "./england/detail";
export const catalogueV12 = {
  ...catalogueV11,
  version: "1.2.0",
  releasedAt: "2026-10-17",
  sources: englandDetailSources,
  requirements: englandDetailRequirements,
  coverage: [
    ...englandDetailCoverage,
    ...catalogueV11.coverage.filter((cell) => cell.jurisdiction !== "GB-ENG"),
  ],
};
