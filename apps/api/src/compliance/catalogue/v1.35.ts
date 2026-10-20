import { catalogueV134 } from "./v1.34";
import { northernIrelandDistrictCoverage } from "./northern-ireland/district-coverage";

export const catalogueV135 = {
  ...catalogueV134,
  version: "1.35.0",
  releasedAt: "2026-10-20",
  coverage: [...catalogueV134.coverage, ...northernIrelandDistrictCoverage],
};
