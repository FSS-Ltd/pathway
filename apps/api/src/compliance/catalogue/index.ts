import { catalogueSchema } from "./schema";
import { catalogueV14 } from "./v1.4";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV14);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
