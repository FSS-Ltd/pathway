import { catalogueV1 } from "./v1";
import {
  englandCoverage,
  englandRequirements,
  englandSources,
} from "./england";
export const catalogueV11 = {
  ...catalogueV1,
  version: "1.1.0",
  sources: englandSources,
  requirements: englandRequirements,
  coverage: [
    ...englandCoverage,
    ...catalogueV1.coverage.filter((cell) => cell.jurisdiction !== "GB-ENG"),
  ],
};
