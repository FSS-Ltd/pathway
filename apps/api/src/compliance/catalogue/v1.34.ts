import { catalogueV133 } from "./v1.33";
import { scotlandAuthorityCoverage } from "./scotland/authority-coverage";

export const catalogueV134 = {
  ...catalogueV133,
  version: "1.34.0",
  releasedAt: "2026-10-20",
  coverage: [...catalogueV133.coverage, ...scotlandAuthorityCoverage],
};
