import { catalogueSchema } from "./schema";
import { catalogueV138 } from "./v1.38";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV138);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
