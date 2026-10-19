import { catalogueSchema } from "./schema";
import { catalogueV112 } from "./v1.12";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV112);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
