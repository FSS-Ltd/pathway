import { catalogueSchema } from "./schema";
import { catalogueV132 } from "./v1.32";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV132);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
