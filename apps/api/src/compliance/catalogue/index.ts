import { catalogueSchema } from "./schema";
import { catalogueV11 } from "./v1.1";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV11);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
