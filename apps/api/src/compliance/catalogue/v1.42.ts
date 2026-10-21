import {
  belgiumGermanSchoolRequirements,
  belgiumGermanSchoolReview,
  belgiumGermanSchoolSources,
} from "./belgium/german-school";
import { catalogueV141 } from "./v1.41";

const sourceIds = belgiumGermanSchoolSources.map((source) => source.id);

export const catalogueV142 = {
  ...catalogueV141,
  version: "1.42.0",
  releasedAt: "2026-10-21",
  sources: [...catalogueV141.sources, ...belgiumGermanSchoolSources],
  requirements: [
    ...catalogueV141.requirements,
    ...belgiumGermanSchoolRequirements,
  ],
  coverage: catalogueV141.coverage.map((cell) =>
    cell.jurisdiction === "BE" &&
    ["registration_governance", "education_childcare"].includes(cell.topic)
      ? {
          ...cell,
          reason:
            "Flemish recognition, French Community school routes and German-speaking Community organised/subsidised school projects, rules and attendance controls reviewed conditionally. German recognised-unsubsidised and outside-network schools, French provider registration, specialist duties and regional/municipal rules remain incomplete.",
          sourceIds: [...new Set([...cell.sourceIds, ...sourceIds])],
          review: belgiumGermanSchoolReview,
        }
      : cell,
  ),
};
