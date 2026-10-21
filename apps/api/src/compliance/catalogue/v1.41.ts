import {
  belgiumFrenchSchoolRequirements,
  belgiumFrenchSchoolReview,
  belgiumFrenchSchoolSources,
} from "./belgium/french-school";
import { catalogueV140 } from "./v1.40";

const sourceIds = belgiumFrenchSchoolSources.map((source) => source.id);

export const catalogueV141 = {
  ...catalogueV140,
  version: "1.41.0",
  releasedAt: "2026-10-21",
  sources: [...catalogueV140.sources, ...belgiumFrenchSchoolSources],
  requirements: [
    ...catalogueV140.requirements,
    ...belgiumFrenchSchoolRequirements,
  ],
  coverage: catalogueV140.coverage.map((cell) =>
    cell.jurisdiction === "BE" &&
    ["registration_governance", "education_childcare"].includes(cell.topic)
      ? {
          ...cell,
          reason:
            "Flemish recognition and French Community organised/subsidised school-project, attendance and outside-network family-declaration routes reviewed conditionally. German-speaking school routes, French provider registration and specialist duties, and regional/municipal rules remain incomplete.",
          sourceIds: [...new Set([...cell.sourceIds, ...sourceIds])],
          review: belgiumFrenchSchoolReview,
        }
      : cell,
  ),
};
