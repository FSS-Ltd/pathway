import { catalogueSchema } from "./schema";
import { catalogueV133 } from "./v1.33";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV133);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
