import { catalogueSchema } from "./schema";
import { catalogueV139 } from "./v1.39";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV139);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
