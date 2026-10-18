import { catalogueSchema } from "./schema";
import { catalogueV18 } from "./v1.8";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV18);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
