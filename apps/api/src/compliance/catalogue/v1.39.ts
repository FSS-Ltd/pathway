import {
  belgiumChildcareRequirements,
  belgiumChildcareReview,
  belgiumChildcareSources,
} from "./belgium/childcare";
import { catalogueV138 } from "./v1.38";

const childcareSourceIds = belgiumChildcareSources.map((source) => source.id);

export const catalogueV139 = {
  ...catalogueV138,
  version: "1.39.0",
  releasedAt: "2026-10-21",
  sources: [...catalogueV138.sources, ...belgiumChildcareSources],
  requirements: [
    ...catalogueV138.requirements,
    ...belgiumChildcareRequirements,
  ],
  coverage: catalogueV138.coverage.map((cell) =>
    cell.jurisdiction === "BE" && cell.topic === "education_childcare"
      ? {
          ...cell,
          reason:
            "Four authority-specific childcare licensing routes reviewed conditionally. School recognition, care staffing and inspection details, school-age care outside the German-speaking route, and Region/municipal rules remain incomplete.",
          sourceIds: [...new Set([...cell.sourceIds, ...childcareSourceIds])],
          review: belgiumChildcareReview,
        }
      : cell,
  ),
};
