import { catalogueSchema } from "./schema";
import { catalogueV137 } from "./v1.37";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV137);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
