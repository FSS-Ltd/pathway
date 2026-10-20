import { catalogueSchema } from "./schema";
import { catalogueV123 } from "./v1.23";
export const TRACKER_CATALOGUE = catalogueSchema.parse(catalogueV123);
export { catalogueSchema } from "./schema";
export type {
  TrackerCatalogue,
  CatalogueRequirement,
  Condition,
} from "./schema";
