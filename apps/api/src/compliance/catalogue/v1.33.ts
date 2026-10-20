import { catalogueV132 } from "./v1.32";
import { englandAuthorityCoverage } from "./england/authority-coverage";

export const catalogueV133 = {
  ...catalogueV132,
  version: "1.33.0",
  releasedAt: "2026-10-20",
  coverage: [...catalogueV132.coverage, ...englandAuthorityCoverage],
};
