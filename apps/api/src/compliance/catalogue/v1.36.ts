import { irelandLocalAuthorityCoverage } from "./ireland/local-authority-coverage";
import { catalogueV135 } from "./v1.35";

export const catalogueV136 = {
  ...catalogueV135,
  version: "1.36.0",
  releasedAt: "2026-10-20",
  coverage: [...catalogueV135.coverage, ...irelandLocalAuthorityCoverage],
};
