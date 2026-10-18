import { catalogueSchema } from "./schema";
import { catalogueV16 } from "./v1.6";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV16);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
