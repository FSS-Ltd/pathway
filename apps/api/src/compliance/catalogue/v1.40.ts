import {
  belgiumSchoolRequirements,
  belgiumSchoolReview,
  belgiumSchoolSources,
} from "./belgium/school";
import { catalogueV139 } from "./v1.39";

const schoolSourceIds = belgiumSchoolSources.map((source) => source.id);

export const catalogueV140 = {
  ...catalogueV139,
  version: "1.40.0",
  releasedAt: "2026-10-21",
  sources: [...catalogueV139.sources, ...belgiumSchoolSources],
  requirements: [...catalogueV139.requirements, ...belgiumSchoolRequirements],
  coverage: catalogueV139.coverage.map((cell) =>
    cell.jurisdiction === "BE" && cell.topic === "registration_governance"
      ? {
          ...cell,
          reason:
            "Flemish school recognition reviewed conditionally. French and German-speaking school routes, unrecognised and externally recognised schools, other provider registration, and regional/municipal rules remain incomplete.",
          sourceIds: [...new Set([...cell.sourceIds, ...schoolSourceIds])],
          review: belgiumSchoolReview,
        }
      : cell,
  ),
};
